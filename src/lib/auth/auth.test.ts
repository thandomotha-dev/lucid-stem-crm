import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSessionToken, hashToken } from "./session-token.ts";
import { isLocked, nextFailureState, MAX_FAILED_LOGINS, LOCK_MINUTES } from "./lockout.ts";

test("session tokens are unique, long, and stored only as a hash", () => {
  const a = generateSessionToken(), b = generateSessionToken();
  assert.notEqual(a.token, b.token);
  assert.ok(a.token.length >= 43);
  assert.equal(hashToken(a.token), a.tokenHash);
  assert.notEqual(a.tokenHash, a.token);
});

test("account locks after the max failed attempts, then counter resets", () => {
  const now = new Date("2026-01-01T10:00:00Z");
  let state = { failedCount: 0, lockedUntil: null as Date | null };
  for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
    state = nextFailureState(state.failedCount, now);
    assert.equal(state.lockedUntil, null);
  }
  state = nextFailureState(state.failedCount, now);
  assert.ok(state.lockedUntil);
  assert.equal(state.failedCount, 0);
  assert.equal(state.lockedUntil!.getTime() - now.getTime(), LOCK_MINUTES * 60_000);
});

test("isLocked respects expiry", () => {
  const now = new Date("2026-01-01T10:00:00Z");
  assert.equal(isLocked(null, now), false);
  assert.equal(isLocked(new Date("2026-01-01T10:05:00Z"), now), true);
  assert.equal(isLocked(new Date("2026-01-01T09:59:00Z"), now), false);
});
