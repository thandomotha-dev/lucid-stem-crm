import { cookies, headers } from "next/headers";
import { prisma } from "./db.ts";
import { recordAudit } from "./events.ts";
import { requireContext } from "./auth.ts";
import { normalizeEmail } from "../lib/import/email.ts";
import { hashPassword, validatePasswordPolicy } from "../lib/auth/password.ts";
import { generateSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from "../lib/auth/session-token.ts";
import {
  INVITABLE_ROLES, INVITE_TTL_MS, generateInviteToken, hashInviteToken, inviteState,
  type InvitableRole, type InviteState,
} from "../lib/auth/invite-token.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function createInvite(
  emailRaw: string, role: string,
): Promise<{ ok: true; link: string; email: string } | { ok: false; error: string }> {
  const ctx = await requireContext("user:manage");
  const email = normalizeEmail(emailRaw);
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!(INVITABLE_ROLES as readonly string[]).includes(role)) return { ok: false, error: "Choose a role." };
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return { ok: false, error: "An account with this email already exists." };
  }
  const { token, tokenHash } = generateInviteToken();
  const now = new Date();
  const ip = await clientIp();
  await prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.create({
      data: {
        organizationId: ctx.organizationId, email, role: role as InvitableRole, tokenHash,
        createdById: ctx.userId, expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      },
    });
    await recordAudit(tx, {
      organizationId: ctx.organizationId, actorId: ctx.userId, action: "user.invited",
      metadata: { invitationId: inv.id, role }, ip,
    });
  });
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { ok: true, link: `${proto}://${host}/signup/${token}`, email };
}

export async function listTeam() {
  const ctx = await requireContext("user:manage");
  const [members, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: ctx.organizationId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 50,
    }),
  ]);
  const now = new Date();
  return {
    members: members.map((m) => ({ id: m.id, name: m.user.name, email: m.user.email, role: m.role })),
    invites: invites.map((i) => ({
      id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, state: inviteState(i, now),
    })),
  };
}

export async function revokeInvite(id: string): Promise<void> {
  const ctx = await requireContext("user:manage");
  const ip = await clientIp();
  await prisma.$transaction(async (tx) => {
    const r = await tx.invitation.updateMany({
      where: { id, organizationId: ctx.organizationId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (r.count === 1) {
      await recordAudit(tx, {
        organizationId: ctx.organizationId, actorId: ctx.userId, action: "user.invite_revoked",
        metadata: { invitationId: id }, ip,
      });
    }
  });
}

/** Public: used by the sign-up page. Reveals nothing beyond the invited email and organisation name. */
export async function getInviteForSignup(
  token: string,
): Promise<{ state: InviteState | "invalid"; email?: string; orgName?: string }> {
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { organization: { select: { name: true } } },
  });
  if (!inv) return { state: "invalid" };
  const state = inviteState(inv, new Date());
  if (state !== "valid") return { state };
  return { state, email: inv.email, orgName: inv.organization.name };
}

export async function acceptInvite(
  token: string, nameRaw: string, password: string, confirm: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = nameRaw.trim();
  if (name.length < 1 || name.length > 100) return { ok: false, error: "Enter your name." };
  if (password !== confirm) return { ok: false, error: "Passwords do not match." };
  const policy = validatePasswordPolicy(password);
  if (policy) return { ok: false, error: policy };

  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashInviteToken(token) } });
  const gone = { ok: false as const, error: "This invite link is no longer valid. Ask for a new one." };
  if (!inv || inviteState(inv, new Date()) !== "valid") return gone;

  const passwordHash = await hashPassword(password);
  const ip = await clientIp();
  const userAgent = (await headers()).get("user-agent");
  const now = new Date();
  const { token: sessionToken, tokenHash } = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  try {
    await prisma.$transaction(async (tx) => {
      // Atomic claim: only one request can ever use an invite.
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new Error("INVITE_UNAVAILABLE");
      const user = await tx.user.create({ data: { email: inv.email, name, passwordHash, lastLoginAt: now } });
      await tx.membership.create({ data: { userId: user.id, organizationId: inv.organizationId, role: inv.role } });
      await tx.session.create({
        data: { userId: user.id, activeOrganizationId: inv.organizationId, tokenHash, expiresAt, userAgent, ip },
      });
      await recordAudit(tx, {
        organizationId: inv.organizationId, actorId: user.id, action: "auth.signup",
        metadata: { invitationId: inv.id, role: inv.role }, ip,
      });
    }, { maxWait: 10000, timeout: 20000 });
  } catch (e) {
    if (e instanceof Error && e.message === "INVITE_UNAVAILABLE") return gone;
    if ((e as { code?: string }).code === "P2002") {
      return { ok: false, error: "An account with this email already exists. Try signing in." };
    }
    console.error("[signup] failed", e);
    return { ok: false, error: "Could not create your account. Please try again." };
  }

  (await cookies()).set(SESSION_COOKIE, sessionToken, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
  });
  return { ok: true };
}
