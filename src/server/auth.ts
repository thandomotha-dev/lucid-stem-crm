import { cookies, headers } from "next/headers";
import { prisma } from "./db.ts";
import { recordAudit } from "./events.ts";
import { normalizeEmail } from "../lib/import/email.ts";
import { dummyVerify, needsRehash, hashPassword, verifyPassword } from "../lib/auth/password.ts";
import { generateSessionToken, hashToken, SESSION_COOKIE, SESSION_TTL_MS } from "../lib/auth/session-token.ts";
import { isLocked, nextFailureState } from "../lib/auth/lockout.ts";
import { assertCan, type Permission, type Role } from "../lib/permissions.ts";

export type Ctx = { userId: string; userName: string; organizationId: string; role: Role };

const GENERIC_FAIL = "Email or password is incorrect.";

export async function login(emailRaw: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent");
  const now = new Date();
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(emailRaw) }, include: { memberships: true } });

  if (!user || !user.isActive) {
    await dummyVerify(password);
    await prisma.$transaction((tx) => recordAudit(tx, { organizationId: null, action: "auth.login_failed", metadata: { reason: "unknown_or_inactive" }, ip }));
    return { ok: false, error: GENERIC_FAIL };
  }
  if (isLocked(user.lockedUntil, now)) {
    return { ok: false, error: "Too many failed attempts. Try again in a few minutes." };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const next = nextFailureState(user.failedLoginCount, now);
    await prisma.user.update({ where: { id: user.id }, data: next });
    await prisma.$transaction((tx) => recordAudit(tx, { organizationId: null, actorId: user.id, action: next.lockedUntil ? "auth.locked" : "auth.login_failed", ip }));
    return { ok: false, error: GENERIC_FAIL };
  }
  const membership = user.memberships[0];
  if (!membership) return { ok: false, error: "This account has no organisation access." };

  const { token, tokenHash } = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0, lockedUntil: null, lastLoginAt: now,
        ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
      },
    });
    await tx.session.create({ data: { userId: user.id, activeOrganizationId: membership.organizationId, tokenHash, expiresAt, userAgent, ip } });
    await recordAudit(tx, { organizationId: membership.organizationId, actorId: user.id, action: "auth.login", ip });
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
  });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Resolve the signed-in user + organisation + role from the session cookie, or null. */
export async function getContext(): Promise<Ctx | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;
  const m = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: session.userId, organizationId: session.activeOrganizationId } },
  });
  if (!m) return null; // membership revoked: session is dead immediately
  return { userId: session.userId, userName: session.user.name, organizationId: m.organizationId, role: m.role };
}

export async function requireContext(permission?: Permission): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx) throw new Error("UNAUTHENTICATED");
  if (permission) assertCan(ctx.role, permission);
  return ctx;
}
