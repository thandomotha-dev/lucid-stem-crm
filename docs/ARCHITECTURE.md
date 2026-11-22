# Architecture

```
src/lib/        Pure logic, no framework or DB imports. Unit-tested with `node --test`.
  permissions.ts      roles -> permissions matrix
  auth/               password hashing (scrypt), session tokens, lockout rules
  crypto/secretbox.ts AES-256-GCM for OAuth tokens at rest
  import/             CSV: parse, mapping, validation, duplicates, templates
src/server/     DB-backed services. Every function takes a Ctx {userId, organizationId, role}.
  auth.ts             login/logout/getContext/requireContext
  leads.ts            lead CRUD; writes activity + outbox event in one transaction
  events.ts           emitEvent (outbox) + recordAudit
  queue/boss.ts       the only place pg-boss is touched
src/worker/     Separate long-running process for background jobs
src/app/        Next.js UI (thin: calls server/ functions)
prisma/         schema + seed
```

## Rules the code follows
1. **Organisation scoping.** Every query filters on `ctx.organizationId`. IDs from the client are never trusted on their own.
2. **Permission checks live in the server layer**, not only the UI. UI hides buttons; `assertCan` enforces.
3. **Outbox events.** State changes that automation cares about write a `DomainEvent` row in the same transaction.
4. **Secrets.** Session tokens stored hashed. OAuth tokens encrypted (AES-GCM, key from env). Passwords scrypt-hashed.
5. **Imports never email anyone.** They set no marketing state and create no campaign membership.

## CSV import design (library done; DB workflow next)
upload -> parse once (cap: 25 MB / 200k rows) -> stage every row in `ImportRow` -> user maps columns -> validate in batches
-> classify duplicates (in-file + existing, including archived) -> summary screen -> confirm -> commit in batches of ~500 via pg-boss
-> report from `ImportRow` statuses. Staging in Postgres means no object storage and resumable batches.
"Update existing" can only fill blanks (or overwrite when chosen) on profile fields; it cannot change email, status, unsubscribe or bounce state.

## Planned for milestone 2 (not built)
Campaigns, sequences (JSON workflow definitions, versioned), enrollments (state machine with reasons), messages,
send claims (unique `(enrollment, step)` for duplicate-send prevention), `AutomationLog` (every sent/skipped/delayed/failed/stopped
with reason), the emergency-switch check in the send path, `EmailProvider` interface + mock provider.
