import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, validatePasswordPolicy, needsRehash } from "./password.ts";

test("hash then verify succeeds; wrong password fails", async () => {
  const h = await hashPassword("correct horse battery");
  assert.ok(await verifyPassword("correct horse battery", h));
  assert.ok(!(await verifyPassword("correct horse batterz", h)));
});

test("same password hashes differently (random salt)", async () => {
  assert.notEqual(await hashPassword("same-password-123"), await hashPassword("same-password-123"));
});

test("malformed or forged stored hashes verify as false, never throw", async () => {
  for (const bad of ["", "plaintext", "scrypt$1$2$3", "bcrypt$a$b$c$d$e", "scrypt$99999999999$8$1$AAAA$AAAA", "scrypt$32768$8$1$AAAA$"]) {
    assert.equal(await verifyPassword("whatever-password", bad), false, bad);
  }
});

test("password policy", () => {
  assert.ok(validatePasswordPolicy("short"));
  assert.equal(validatePasswordPolicy("long enough password"), null);
  assert.ok(validatePasswordPolicy("x".repeat(500)));
});

test("current-parameter hashes do not need rehash", async () => {
  assert.equal(needsRehash(await hashPassword("some-long-password")), false);
  assert.equal(needsRehash("scrypt$16384$8$1$AAAA$AAAA"), true);
});
