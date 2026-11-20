import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret } from "./secretbox.ts";

const K = randomBytes(32).toString("base64");

test("round trip", () => {
  assert.equal(decryptSecret(encryptSecret("refresh-token", K, "acct1"), K, "acct1"), "refresh-token");
});
test("ciphertext differs each time (random IV)", () => {
  assert.notEqual(encryptSecret("x", K), encryptSecret("x", K));
});
test("tampering is detected", () => {
  const p = encryptSecret("secret", K);
  const parts = p.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptSecret(parts.join("."), K));
});
test("wrong key or wrong context fails", () => {
  const p = encryptSecret("secret", K, "acct1");
  assert.throws(() => decryptSecret(p, randomBytes(32).toString("base64"), "acct1"));
  assert.throws(() => decryptSecret(p, K, "acct2"));
});
test("bad key length rejected", () => {
  assert.throws(() => encryptSecret("x", Buffer.from("short").toString("base64")));
});
