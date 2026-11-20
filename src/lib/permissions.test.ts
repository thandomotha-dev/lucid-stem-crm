import { test } from "node:test";
import assert from "node:assert/strict";
import { can, assertCan, ForbiddenError, PERMISSIONS, ROLES } from "./permissions.ts";

test("owner holds every permission", () => {
  for (const p of PERMISSIONS) assert.ok(can("OWNER", p), p);
});

test("roles are strictly nested: each role includes everything below it", () => {
  for (let i = 0; i < ROLES.length - 1; i++) {
    const higher = ROLES[i]!, lower = ROLES[i + 1]!;
    for (const p of PERMISSIONS) if (can(lower, p)) assert.ok(can(higher, p), `${higher} lacks ${p}`);
  }
});

test("viewer is read-only", () => {
  assert.ok(can("VIEWER", "lead:read"));
  assert.ok(!can("VIEWER", "lead:create"));
  assert.ok(!can("VIEWER", "import:create"));
  assert.ok(!can("VIEWER", "automation:pause"));
});

test("members can pause automation but only admins can resume it", () => {
  assert.ok(can("MEMBER", "automation:pause"));
  assert.ok(!can("MEMBER", "automation:resume"));
  assert.ok(can("ADMIN", "automation:resume"));
});

test("only owners manage users and the organisation", () => {
  assert.ok(!can("ADMIN", "user:manage"));
  assert.ok(!can("ADMIN", "org:manage"));
  assert.ok(can("OWNER", "user:manage"));
});

test("assertCan throws ForbiddenError", () => {
  assert.throws(() => assertCan("VIEWER", "lead:create"), ForbiddenError);
  assert.doesNotThrow(() => assertCan("MEMBER", "lead:create"));
});

test("unknown role is denied", () => {
  assert.equal(can("HACKER" as never, "lead:read"), false);
});
