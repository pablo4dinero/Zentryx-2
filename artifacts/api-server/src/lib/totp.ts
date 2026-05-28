// otplib v13 ships as CommonJS with a flat functional API
// (generateSecret / generateURI / generateSync / verifySync) rather
// than the old `authenticator` singleton. We import the namespace and
// pull the functions off it — this resolves correctly under both ESM
// (tsx dev) and the esbuild CJS bundle (Render prod).
import * as otplib from "otplib";
import QRCode from "qrcode";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

const ISSUER = "Zentryx";
// ±1 step (30 s) tolerance so a slightly-skewed phone clock still
// validates the current code.
const VERIFY_WINDOW = 1;

/**
 * Generate a fresh base32-encoded TOTP secret. Store this on the user
 * row (`mfa_secret`) — anyone with this value can produce valid codes,
 * so treat as a credential equivalent to a password.
 */
export function generateTotpSecret(): string {
  return otplib.generateSecret();
}

/**
 * Build the standard otpauth:// URI that authenticator apps scan as a
 * QR code. `accountLabel` shows up as the entry's title in the app —
 * we use the user's email so they can distinguish accounts.
 */
export function buildOtpAuthUri(secret: string, accountLabel: string): string {
  return otplib.generateURI({ secret, label: accountLabel, issuer: ISSUER });
}

/**
 * Generate the QR code as a data URL (base64 PNG). Frontend can embed
 * this directly with <img src={dataUrl} />.
 */
export async function generateQrCodeDataUrl(otpAuthUri: string): Promise<string> {
  return QRCode.toDataURL(otpAuthUri, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 6,
  });
}

/**
 * Verify a 6-digit user-submitted code against the stored secret. Returns
 * true if the code is valid for the current 30s window (or ±1 window
 * per VERIFY_WINDOW).
 */
export function verifyTotp(secret: string, code: string): boolean {
  // Strip whitespace, dashes, etc — users sometimes paste with separators.
  const cleaned = code.replace(/\D/g, "");
  if (cleaned.length !== 6) return false;
  try {
    const result = otplib.verifySync({ token: cleaned, secret, window: VERIFY_WINDOW });
    return result?.valid === true;
  } catch {
    return false;
  }
}

// ── Backup codes ──────────────────────────────────────────────────────
//
// Ten single-use recovery codes generated at enrollment. Format:
// XXXX-XXXX (8 alphanumeric chars + hyphen) — easy to type by hand,
// unambiguous (no 0/O, 1/I/L). Stored as bcrypt hashes in the
// `mfa_backup_codes` JSON column; the user sees the plaintext exactly
// once at enrollment. Each code burns on use.

const BACKUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_COUNT = 10;

function generateBackupCodePlain(): string {
  const bytes = randomBytes(BACKUP_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
    out += BACKUP_CODE_ALPHABET[bytes[i] % BACKUP_CODE_ALPHABET.length];
  }
  // Insert hyphen halfway through for readability: XXXX-XXXX
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export interface GeneratedBackupCodes {
  /** Plaintext codes — show ONCE to the user, never persist. */
  plaintext: string[];
  /** Bcrypt hashes — what we store in `mfa_backup_codes`. */
  hashes: string[];
}

/**
 * Mint 10 fresh backup codes. Returns both plaintext (for the
 * one-time-display screen) and hashes (for persistence).
 */
export async function generateBackupCodes(): Promise<GeneratedBackupCodes> {
  const plaintext: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = generateBackupCodePlain();
    plaintext.push(code);
    hashes.push(await bcrypt.hash(code, 10));
  }
  return { plaintext, hashes };
}

/**
 * Verify a user-submitted backup code against the stored hash array.
 * On success returns the updated hash array with the used code removed
 * (caller persists it). On failure returns null.
 */
export async function verifyAndConsumeBackupCode(
  storedHashes: string[],
  submitted: string,
): Promise<string[] | null> {
  // Normalise: accept with or without the hyphen, case-insensitive.
  const cleaned = submitted.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (cleaned.length !== BACKUP_CODE_LENGTH) return null;
  const candidate = `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  for (let i = 0; i < storedHashes.length; i++) {
    const match = await bcrypt.compare(candidate, storedHashes[i]);
    if (match) {
      // Burn this code by removing it from the array.
      return storedHashes.filter((_, idx) => idx !== i);
    }
  }
  return null;
}
