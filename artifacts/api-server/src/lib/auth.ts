import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// JWT secret must come from env. Refusing to boot without it is intentional
// — a hard-coded fallback would mean anyone with read access to this file
// can forge tokens. Production deploys (Render) set this via environment
// variables; local dev sets it in .env (which is git-ignored).
const JWT_SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "[auth] JWT_SECRET is missing or shorter than 32 chars. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\" " +
      "and set it as an environment variable before starting the server.",
    );
  }
  return s;
})();

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
  // ── Token revocation ────────────────────────────────────────────────
  // Must match user.tokenVersion in DB. Mismatch = token revoked.
  tv: number;
  // ── Phase 1 session policy ──────────────────────────────────────────
  idleUntil?: number;
  absoluteExpiry?: number;
  noExpiry?: boolean;
}

export interface MfaJwtPayload {
  userId: number;
  email: string;
  role: string;
  mfaPending: true;
}

// Session lifetimes (seconds). Tweak via env in special circumstances —
// e.g. a longer absolute cap during a known overnight migration. Default
// matches the agreed policy: 6h idle, 12h absolute.
const IDLE_TTL_SEC = Number(process.env.SESSION_IDLE_TTL_SEC) || 6 * 60 * 60;
const ABSOLUTE_TTL_SEC = Number(process.env.SESSION_ABSOLUTE_TTL_SEC) || 12 * 60 * 60;

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Sign a standard session token with 6h-idle / 12h-absolute expiry.
 * The JWT `expiresIn` is set to the absolute ceiling so a token can
 * never outlive its absolute cap even if the idleUntil math is buggy.
 */
export function signToken(payload: Omit<JwtPayload, "idleUntil" | "absoluteExpiry" | "noExpiry"> & { tv: number }): string {
  const now = nowSec();
  const full: JwtPayload = {
    ...payload,
    idleUntil: now + IDLE_TTL_SEC,
    absoluteExpiry: now + ABSOLUTE_TTL_SEC,
  };
  return jwt.sign(full, JWT_SECRET, { expiresIn: ABSOLUTE_TTL_SEC });
}

/**
 * Sign a superadmin-only token that bypasses both idle and absolute
 * expiry. Lifetime is the legacy 7 days. Only ever called from the
 * superadmin bypass path; should never be reachable for normal users.
 */
export function signSuperadminToken(payload: Omit<JwtPayload, "idleUntil" | "absoluteExpiry" | "noExpiry">): string {
  return jwt.sign({ ...payload, noExpiry: true }, JWT_SECRET, { expiresIn: "7d" });
}

export function signMfaToken(payload: Omit<MfaJwtPayload, "mfaPending">): string {
  return jwt.sign({ ...payload, mfaPending: true }, JWT_SECRET, { expiresIn: "15m" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyMfaToken(token: string): MfaJwtPayload {
  const payload = jwt.verify(token, JWT_SECRET) as MfaJwtPayload;
  if (!payload.mfaPending) throw new Error("Not an MFA token");
  return payload;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "No token provided" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload & { mfaPending?: boolean };
    console.log("[requireAuth] Verified token with userId:", payload.userId, "email:", payload.email, "noExpiry:", payload.noExpiry);
    if (payload.mfaPending) {
      res.status(401).json({ error: "MFAPending", message: "SMS verification required" });
      return;
    }

    // Session-policy gate. Superadmin tokens carry `noExpiry: true` and
    // skip the whole block. For everyone else we enforce both ceilings.
    if (!payload.noExpiry) {
      const now = nowSec();
      if (payload.absoluteExpiry && now > payload.absoluteExpiry) {
        res.status(401).json({ error: "SessionExpired", reason: "absolute", message: "Session expired (12 h max). Please sign in again." });
        return;
      }
      if (payload.idleUntil && now > payload.idleUntil) {
        res.status(401).json({ error: "SessionExpired", reason: "idle", message: "Session expired due to inactivity. Please sign in again." });
        return;
      }
      // Sliding refresh — push the idle window forward, but never past
      // the absolute cap. Frontend reads the new token from
      // `x-refreshed-token` if it wants to swap without re-login.
      //
      // IMPORTANT: strip the jwt-managed `iat` / `exp` claims off the
      // verified payload before re-signing. jsonwebtoken throws
      // ("payload already has an exp property") if you pass `expiresIn`
      // alongside a payload that still carries `exp` — that throw was
      // caught below and returned as a 401, bouncing every regular user
      // straight back to the login screen on their first authed request.
      if (payload.idleUntil && payload.absoluteExpiry) {
        const proposedIdle = now + IDLE_TTL_SEC;
        const newIdleUntil = Math.min(proposedIdle, payload.absoluteExpiry);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { iat: _iat, exp: _exp, ...rest } = payload as JwtPayload & { iat?: number; exp?: number };
        const refreshed = { ...rest, idleUntil: newIdleUntil };
        console.log("[requireAuth] Creating refreshed token. Original userId:", payload.userId, "Refreshed userId:", refreshed.userId);
        const remainingAbsolute = Math.max(1, payload.absoluteExpiry - now);
        const newToken = jwt.sign(refreshed, JWT_SECRET, { expiresIn: remainingAbsolute });
        res.setHeader("x-refreshed-token", newToken);
      }
    }

    // Token version check — if admin revoked this user or user logged out
    // all devices, their tokenVersion in DB will be higher than tv in JWT.
    // Skip for superadmin (noExpiry) to avoid the DB hit on every request.
    if (!payload.noExpiry && payload.tv !== undefined) {
      const [user] = await db
        .select({ tokenVersion: usersTable.tokenVersion, isActive: usersTable.isActive })
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId))
        .limit(1);
      if (!user || !user.isActive) {
        res.status(401).json({ error: "Unauthorized", message: "Account deactivated" });
        return;
      }
      if (user.tokenVersion !== payload.tv) {
        res.status(401).json({ error: "SessionExpired", reason: "revoked", message: "Session was revoked. Please sign in again." });
        return;
      }
    }

    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized", message: "Invalid token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden", message: "Insufficient permissions" });
      return;
    }
    next();
  };
}
