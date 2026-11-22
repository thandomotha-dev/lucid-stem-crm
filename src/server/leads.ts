import { z } from "zod";
import { prisma } from "./db.ts";
import { emitEvent } from "./events.ts";
import { assertCan, type Role } from "../lib/permissions.ts";
import { checkEmail } from "../lib/import/email.ts";
import type { Ctx } from "./auth.ts";

const optional = z.string().trim().max(200).optional().transform((v) => v || undefined);

export const leadInput = z.object({
  email: z.string().trim(),
  firstName: optional, lastName: optional, company: optional, jobTitle: optional,
  phone: z.string().trim().max(40).optional().transform((v) => v || undefined),
  website: optional, industry: optional, country: optional, timezone: optional,
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});
export type LeadInput = z.input<typeof leadInput>;

export type LeadResult<T = { id: string }> = { ok: true; data: T } | { ok: false; error: string };

export async function createLead(ctx: Ctx, raw: LeadInput): Promise<LeadResult> {
  assertCan(ctx.role, "lead:create");
  const parsed = leadInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { email, tags, ...rest } = parsed.data;
  const check = checkEmail(email);
  if (!check.ok) return { ok: false, error: "Email address is not valid." };

  const existing = await prisma.lead.findUnique({
    where: { organizationId_emailNormalized: { organizationId: ctx.organizationId, emailNormalized: check.normalized } },
    select: { archivedAt: true },
  });
  if (existing) return { ok: false, error: existing.archivedAt ? "An archived lead with this email already exists." : "A lead with this email already exists." };

  const lead = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: { ...rest, organizationId: ctx.organizationId, email: check.normalized, emailNormalized: check.normalized, source: "manual", ownerId: ctx.userId },
    });
    for (const name of new Set(tags)) {
      const tag = await tx.tag.upsert({
        where: { organizationId_name: { organizationId: ctx.organizationId, name } },
        create: { organizationId: ctx.organizationId, name }, update: {},
      });
      await tx.leadTag.create({ data: { leadId: lead.id, tagId: tag.id } });
    }
    await tx.leadActivity.create({ data: { organizationId: ctx.organizationId, leadId: lead.id, type: "lead.created", actorId: ctx.userId, data: { source: "manual" } } });
    await emitEvent(tx, { organizationId: ctx.organizationId, type: "lead.created", entityType: "lead", entityId: lead.id });
    return lead;
  });
  return { ok: true, data: { id: lead.id } };
}

export async function changeLeadStatus(ctx: Ctx, leadId: string, status: string): Promise<LeadResult> {
  assertCan(ctx.role, "lead:update");
  const next = z.enum(["NEW", "CONTACTED", "AWAITING_RESPONSE", "REPLIED", "MEETING_SCHEDULED", "ON_HOLD", "NOT_INTERESTED", "CLIENT"]).safeParse(status);
  if (!next.success) return { ok: false, error: "Unknown status." };
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({ where: { id: leadId, organizationId: ctx.organizationId } });
    if (!lead) return { ok: false as const, error: "Lead not found." };
    if (lead.status === next.data) return { ok: true as const, data: { id: lead.id } };
    await tx.lead.update({ where: { id: lead.id }, data: { status: next.data } });
    await tx.leadActivity.create({ data: { organizationId: ctx.organizationId, leadId, type: "lead.status_changed", actorId: ctx.userId, data: { from: lead.status, to: next.data } } });
    // Milestone 2 consumes this: NOT_INTERESTED / CLIENT / ON_HOLD / MEETING_SCHEDULED stop or pause sequences.
    await emitEvent(tx, { organizationId: ctx.organizationId, type: "lead.status_changed", entityType: "lead", entityId: leadId, payload: { from: lead.status, to: next.data, actorId: ctx.userId } });
    return { ok: true as const, data: { id: lead.id } };
  });
}

export async function archiveLead(ctx: Ctx, leadId: string): Promise<LeadResult> {
  assertCan(ctx.role, "lead:archive");
  const res = await prisma.lead.updateMany({ where: { id: leadId, organizationId: ctx.organizationId, archivedAt: null }, data: { archivedAt: new Date() } });
  if (res.count === 0) return { ok: false, error: "Lead not found." };
  await prisma.leadActivity.create({ data: { organizationId: ctx.organizationId, leadId, type: "lead.archived", actorId: ctx.userId } });
  return { ok: true, data: { id: leadId } };
}

export async function listLeads(ctx: Ctx, q: { search?: string; status?: string; tag?: string; page?: number }) {
  assertCan(ctx.role, "lead:read");
  const pageSize = 50, page = Math.max(1, q.page ?? 1);
  const search = q.search?.trim();
  const where = {
    organizationId: ctx.organizationId, archivedAt: null,
    ...(q.status ? { status: q.status as never } : {}),
    ...(q.tag ? { tags: { some: { tag: { name: q.tag } } } } : {}),
    ...(search ? { OR: [
      { emailNormalized: { contains: search.toLowerCase() } },
      { firstName: { contains: search, mode: "insensitive" as const } },
      { lastName: { contains: search, mode: "insensitive" as const } },
      { company: { contains: search, mode: "insensitive" as const } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.lead.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { tags: { include: { tag: true } } } }),
    prisma.lead.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getLead(ctx: Ctx, id: string) {
  assertCan(ctx.role, "lead:read");
  return prisma.lead.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { tags: { include: { tag: true } }, activities: { orderBy: { createdAt: "desc" }, take: 200 } },
  });
}

export type { Role };
