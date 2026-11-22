import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt from node:crypto: no native dependency, portable across hosts.
const N = 32768, R = 8, P = 1, KEYLEN = 64;
const MAXMEM = 256 * N * R; // headroom above the 128*N*R minimum

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200; // bounds hashing cost for oversized input

function derive(password: string, salt: Buffer, n: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keylen, { N: n, r, p, maxmem: 256 * n * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export function validatePasswordPolicy(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEYLEN);
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;
  if (n > 1 << 20) return false; // refuse absurd cost parameters from a corrupted/forged record
  const salt = Buffer.from(parts[4]!, "base64");
  const expected = Buffer.from(parts[5]!, "base64");
  if (expected.length === 0) return false;
  try {
    const actual = await derive(password, salt, n, r, p, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  return !(parts[0] === "scrypt" && Number(parts[1]) === N && Number(parts[2]) === R && Number(parts[3]) === P);
}

let dummy: Promise<string> | null = null;
/** Burn the same CPU as a real check so unknown-email logins aren't distinguishable by timing. */
export async function dummyVerify(password: string): Promise<void> {
  dummy ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(password, await dummy);
}
