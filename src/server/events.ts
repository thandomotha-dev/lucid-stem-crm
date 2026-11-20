import type { Tx } from "./db.ts";

type Json = Record<string, unknown>;

/** Outbox write. Always call inside the same transaction as the change it describes. */
export async function emitEvent(
  tx: Tx,
  e: { organizationId: string; type: string; entityType: string; entityId: string; payload?: Json },
) {
  await tx.domainEvent.create({ data: { ...e, payload: (e.payload ?? {}) as object } });
}

export async function recordAudit(
  tx: Tx,
  a: { organizationId: string | null; actorId?: string | null; action: string; entityType?: string; entityId?: string; metadata?: Json; ip?: string | null },
) {
  await tx.auditLog.create({ data: { ...a, metadata: (a.metadata ?? {}) as object } });
}
