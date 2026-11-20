# Progress

## Milestone 1: foundation (in progress; code written, DB-backed parts not yet run)

### Done and verified (34 unit tests pass: `npm test`)
- [x] Permission matrix and role nesting
- [x] Password hashing (scrypt), session token hashing, login lockout rules
- [x] AES-256-GCM secret encryption (tamper / wrong-key / wrong-context checks)
- [x] CSV library: email validation + normalisation, column auto-mapping and mapping validation,
      row validation (errors vs warnings), duplicate classification, safe merge, template generation, CSV-injection-safe export

### Written but NOT yet executed (needs `npm install` + Postgres; verify first)
- [ ] `prisma/schema.prisma` - run `prisma validate` then `prisma migrate dev`
- [ ] Login/logout/session context, middleware, login page
- [ ] Lead service (create, status change, archive, list, detail) with activity timeline + outbox events
- [ ] Leads list/detail UI
- [ ] Seed script, worker skeleton, pg-boss wrapper
- [ ] `npm run typecheck` and `npm run build` (never run)

### Outstanding for milestone 1
- [ ] Integration tests against a real Postgres: org scoping (user in org A cannot read org B), permission enforcement, duplicate-email rejection, status change writes activity + event atomically
- [ ] CSV import workflow on top of the library: upload route, `ImportRow` staging, mapping screen, validation + duplicate review, summary, batched commit via pg-boss, report + downloadable template, tag assignment, source/date recorded
- [ ] Tags and custom-field management UI
- [ ] User invitation / role management UI (owner only)

## Milestone 2: automation engine (not started)
Emergency switch UI + send-path check, event consumer, sequence runner, mock provider, limits/retries/idempotency, automation activity log, stop/pause rules, end-to-end acceptance test on the mock provider.

## Later
3. Zoho integration (after the documentation gate in DECISIONS.md) -> reply sync -> real-mailbox test -> 4. React Flow builder -> pipeline, tasks, reporting.
