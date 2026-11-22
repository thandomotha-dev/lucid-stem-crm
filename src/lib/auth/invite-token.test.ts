import test from "node:test";
import assert from "node:assert/strict";
import { generateInviteToken, hashInviteToken, inviteState, INVITABLE_ROLES } from "./invite-token.ts";

test("invite tokens are unique, long, and only the hash is derivable", () => {
  const a = generateInviteToken();
  const b = generateInviteToken();
  assert.notEqual(a.token, b.token);
  assert.ok(a.token.length >= 40);
  assert.notEqual(a.token, a.tokenHash);
  assert.equal(a.tokenHash, hashInviteToken(a.token));
  assert.match(a.tokenHash, /^[0-9a-f]{64}$/);
});

test("invite state: valid, expired, used, revoked", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  const future = new Date("2026-11-25T12:00:00Z");
  const past = new Date("2026-11-20T12:00:00Z");
  assert.equal(inviteState({ expiresAt: future, usedAt: null, revokedAt: null }, now), "valid");
  assert.equal(inviteState({ expiresAt: past, usedAt: null, revokedAt: null }, now), "expired");
  assert.equal(inviteState({ expiresAt: future, usedAt: now, revokedAt: null }, now), "used");
  assert.equal(inviteState({ expiresAt: future, usedAt: null, revokedAt: now }, now), "revoked");
  assert.equal(inviteState({ expiresAt: now, usedAt: null, revokedAt: null }, now), "expired");
});

test("owner role can never be invited", () => {
  assert.ok(!(INVITABLE_ROLES as readonly string[]).includes("OWNER"));
});