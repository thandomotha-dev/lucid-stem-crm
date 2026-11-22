# Decision log

| # | Decision | Reason | Revisit when |
|---|----------|--------|--------------|
| 1 | Stack: TS, Next.js 15, Postgres, Prisma, pg-boss, React Flow, Zoho Mail first | Approved by client | - |
| 2 | Engine before builder: workflow builder (React Flow) is built only after the engine passes mock-provider and real-Zoho tests | Client instruction; avoids polishing UI over an unproven engine | - |
| 3 | Multi-user via `Organization` + `Membership(role)` on every table, with one org today | Retrofitting tenancy later is costly; adding it now is nearly free | - |
| 4 | Roles: OWNER, ADMIN, MEMBER, VIEWER. Members may *pause* automation; only admins+ may *resume* | Pausing is always safe; resuming sends email | Team grows |
| 5 | Own session auth (DB sessions, hashed tokens, httpOnly cookie, scrypt, lockout) instead of Auth.js | Host-agnostic, tiny surface, no OAuth login needed yet | SSO/2FA is requested |
| 6 | Absolute 14-day sessions, revoked instantly if membership removed | Simple and safe | Idle timeout wanted |
| 7 | `EmailAccount` table is provider-agnostic; many per org; per-account limits are **nullable and null blocks sending** | Multi-account later; no sending until limits are verified from Zoho docs | Milestone 4 |
| 8 | Emergency switch stored on `Organization.automationPaused`, plus per-account `sendingPaused` | Survives restarts; checked immediately before every send, not only when scheduling | - |
| 9 | Lead email is required and unique per org on a normalised (lowercase) form; archived leads keep their row | Duplicate detection must see archived leads so an import cannot resurrect them. Gmail dots/+tags are NOT folded | Leads without email needed |
| 10 | CSV staged into `ImportRow`; original file not retained (hash + filename kept) | No object-storage dependency; resumable batches | Need original-file download |
| 11 | In-file duplicates: first row wins. Duplicate strategy applies to existing leads: skip / update / review | Predictable | - |
| 12 | "Update" defaults to filling blanks only; never touches email, status, marketing or bounce state | An import must not undo an unsubscribe | - |
| 13 | `MarketingStatus` and `ContactBasis` on leads; imports default to ELIGIBLE/UNKNOWN but enrolment requires explicit campaign selection | Spec requires eligibility checks. POPIA wording needs professional review | Before first live send |
| 14 | Unit tests use Node's built-in runner on dependency-free modules in `src/lib` | Runnable anywhere; keeps logic framework-independent | Integration tests added with DB |
| 15 | pg-boss is touched only via `server/queue/boss.ts` | Localises a later swap to BullMQ | Throughput outgrows Postgres queue |

## Gate before Zoho work (milestone 4)
Verify against official Zoho docs **before writing code**: OAuth regional domains and the `api_domain` returned at token exchange,
required scopes, send-message API, incoming message retrieval / threading fields, any push or webhook support (vs polling or IMAP),
rate limits, daily recipient limits, and acceptable-use rules for automated outreach; then decide whether Zoho Campaigns is needed.
Record findings here and set `EmailAccount` limits from them.
