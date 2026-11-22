# Lucid Stem CRM

A CRM for Lucid Stem built around **event-driven email outreach**: import prospects from CSV, enrol selected ones in follow-up sequences sent through Zoho Mail, detect replies, and stop sequences automatically.

The automation engine is the core of the product. Leads, imports and the timeline exist to feed it.

> **Rule:** engine first, visual builder last. The React Flow workflow builder is only built after the engine passes tests against a mock email provider and then a real Zoho mailbox.

## Stack

- TypeScript, Next.js 15 (App Router, server actions), React 19
- PostgreSQL on Neon, accessed through Prisma 6
- pg-boss 10 for background jobs (Postgres-backed queue)
- zod for validation, papaparse for CSV
- Planned: Zoho Mail API, React Flow

Hosting is undecided. The app and worker need Node 22+ and a Postgres database, and both run as long-lived Node processes.

## Status

| Area | State |
| --- | --- |
| Database, auth, roles, permissions | Working |
| Lead management (create, status change, timeline) | Working |
| CSV import (upload, map, validate, dedupe, commit, report) | Written; manual test plan in progress |
| Campaigns, sequences, sending, Zoho, reply detection | Not started |

See `docs/PROGRESS.md` for what is verified versus only written.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

   If npm warns that install scripts were not approved (Prisma, esbuild), run `npm approve-scripts`, or Prisma will not generate correctly.

2. Copy `.env.example` to `.env` and fill it in:

   | Variable | Purpose |
   | --- | --- |
   | `DATABASE_URL` | Pooled Neon connection string (app runtime) |
   | `DATABASE_URL_UNPOOLED` | Direct Neon connection string (migrations and pg-boss) |
   | `ENCRYPTION_KEY` | 32 random bytes, base64 |
   | `SEED_OWNER_EMAIL` | First login |
   | `SEED_OWNER_PASSWORD` | At least 12 characters |

   Generate the key with:

   ```bash
   node -e "console.log(crypto.randomBytes(32).toString('base64'))"
   ```

   The pooled host contains `-pooler`; the direct one does not. Both need `?sslmode=require`.

3. Create the database schema and the first user:

   ```bash
   npx prisma generate
   npx prisma migrate dev
   npm run db:seed
   ```

4. Start the app and the worker in **two terminals**:

   ```bash
   npm run dev
   ```

   ```bash
   npm run worker
   ```

   Open <http://localhost:3000> and sign in with the seed email and password. Imports will not complete unless the worker is running.

Use your own Neon branch for development. Do not point tests or experiments at shared or production data.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run worker` | Background job worker (pg-boss) |
| `npm run db:seed` | Create the organisation and owner |
| `npm test` | Unit tests (Node built-in runner) |
| `npm run typecheck` | `tsc --noEmit` |

## Project layout

```
src/lib/      Pure logic, no framework or database imports. Unit-tested.
  permissions.ts   roles and permission matrix
  auth/            password hashing, session tokens, lockout
  crypto/          AES-256-GCM for tokens at rest
  import/          CSV parse, mapping, validation, duplicates, pipeline
src/server/   Database-backed services. Every function takes a Ctx.
  auth.ts  leads.ts  events.ts  imports/  queue/boss.ts
src/worker/   Separate long-running process for background jobs
src/app/      Thin Next.js UI that calls src/server
prisma/       Schema, migrations, seed
docs/         ARCHITECTURE.md, DECISIONS.md, PROGRESS.md
```

## Design rules

1. **Organisation scoping.** Every table has `organizationId` and every query filters on it.
2. **Permissions are enforced in the server layer** with `assertCan`, not only hidden in the UI. Roles: Owner, Admin, Member, Viewer.
3. **Outbox events.** Changes the engine cares about write a `DomainEvent` in the same transaction as the change.
4. **Secrets.** Session tokens are stored as SHA-256 hashes, passwords use scrypt, OAuth tokens will use AES-256-GCM.
5. **Imports never email anyone and never enrol leads in a campaign.**
6. **Business logic lives in `src/lib` as pure functions** so it can be tested without a database.

Significant decisions are recorded in `docs/DECISIONS.md`. Read it before changing anything structural.

## CSV import

Flow: upload, stage rows, map columns, validate and classify duplicates, review summary, confirm, background commit in batches of 500, download report.

- Limits: 25 MB and 200,000 rows per file, UTF-8 only.
- Duplicates are detected within the file and against existing leads, including archived ones.
- "Update existing" only fills blank fields. It never changes email, status, unsubscribe or bounce state.
- The commit is resumable and idempotent.
- A CSV template is available at `/imports/template.csv`.

## Roadmap

1. **Milestone 1:** integration tests, tag and custom-field UI, user and role management UI.
2. **Milestone 2:** automation engine with a mock email provider, sequences, sending limits, activity log and the global emergency switch.
3. **Milestone 3:** Zoho Mail integration, after a documentation review.
4. **Milestone 4:** reply detection and auto-stop, then a real-mailbox test.
5. **Milestone 5:** React Flow workflow builder, pipeline, tasks and reporting.

## Before any live send

- Check Zoho's current API, OAuth regions, scopes, sending limits and acceptable-use rules. Sending limits stay `null` (which blocks automated sending) until set from verified numbers.
- Every outreach email needs an unsubscribe mechanism, and a South African professional should review the compliance (POPIA) wording.
- Decide the database region and provider deliberately before real prospect data goes in. It is personal information about South African contacts.

## Security notes

- Never commit `.env` or any `.env.*` file other than `.env.example`.
- Back up `ENCRYPTION_KEY` securely. If it is lost, every stored mailbox connection must be re-authorised.
- Do not run `npm audit fix --force`. Run `npm audit` and judge each finding.
- Revoke any Neon API keys you no longer need.

## Troubleshooting

- **`Can't reach database server`:** check that `.env` contains real connection strings, with no placeholders or `...`.
- **`Environment variable not found: DATABASE_URL_UNPOOLED`:** add it to `.env`.
- **Import stays on "importing":** the worker is not running.
- **Next.js workspace-root warning:** caused by a stray `package-lock.json` in a parent folder. `outputFileTracingRoot` is set in `next.config.mjs`.
