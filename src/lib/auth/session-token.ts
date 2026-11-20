import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "ls_session";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Only the SHA-256 of a token is stored, so a database leak does not yield usable sessions. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}
