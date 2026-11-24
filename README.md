# Lucid Stem CRM

A small, invite-only CRM for managing leads, bulk CSV imports and team access.

## Features

- Lead management with a status timeline and duplicate-email protection
- CSV import with column mapping, validation, preview and a background worker that commits rows
- Invite-based sign-up (no public registration)
- Roles: Owner, Admin, Member, Viewer
- Audit log for sensitive actions (invites, sign-ups)

## Tech stack

- Next.js (App Router) and TypeScript
- Prisma with PostgreSQL (Neon)
- pg-boss job queue, run by a separate worker process

## Requirements

- Node.js 26
- A PostgreSQL database (Neon recommended)

## Setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the values:

   | Variable | Purpose |
   | --- | --- |
   | `DATABASE_URL` | Pooled database connection string |
   | `DATABASE_URL_UNPOOLED` | Direct connection string (used by migrations and the job queue) |
   | `SEED_OWNER_EMAIL` | Email of the first Owner account |
   | `SEED_OWNER_PASSWORD` | Password of the first Owner account |

   Never commit `.env`. It is listed in `.gitignore`.

3. Apply the database migrations and generate the Prisma client:

   ```powershell
   npx prisma migrate deploy
   npx prisma generate
   ```

4. Create the first Owner account by running the seed script.

## Running locally

Run these in two separate terminals from the project root:

```powershell
npm run dev
```

```powershell
npm run worker
```

Open http://localhost:3000 and sign in with the seed Owner credentials. Imports need the worker running.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the web app in development mode |
| `npm run worker` | Start the background worker (import commits) |
| `npm test` | Run the unit tests |
| `npm run typecheck` | Type-check the project |
| `npm run build` | Production build |

## Inviting a team member

1. Sign in as the Owner and open **Team**.
2. Create an invite, choosing a role (Member, Admin or Viewer).
3. Send the invite link to the person. It is single-use and expires after 7 days.
4. They open the link and create their account.

Only a hash of each invite token is stored. The Owner role cannot be invited.

## Data and privacy

Use dummy data only until the hosting and data-region decision has been made. The database currently runs in AWS US East.

## Project docs

- `Lucid Stem CRM Developer Handoff.md`: architecture, roadmap and rules
- `docs/PROGRESS.md`: progress log
- `docs/DECISIONS.md`: design decisions
