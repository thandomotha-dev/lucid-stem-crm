import { randomBytes, createHash } from "node:crypto";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITABLE_ROLES = ["ADMIN", "MEMBER", "VIEWER"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];
export type InviteState = "valid" | "used" | "revoked" | "expired";

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export function inviteState(
  inv: { expiresAt: Date; usedAt: Date | null; revokedAt: Date | null },
  now: Date,
): InviteState {
  if (inv.usedAt) return "used";
  if (inv.revokedAt) return "revoked";
  if (inv.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}