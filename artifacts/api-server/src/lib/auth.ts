import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "rd-intelligence-secret-key-2024";

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
}

export interface MfaJwtPayload {
  userId: number;
  email: string;
  role: string;
  mfaPending: true;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
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

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "No token provided" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload & { mfaPending?: boolean };
    if (payload.mfaPending) {
      res.status(401).json({ error: "MFAPending", message: "SMS verification required" });
      return;
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
