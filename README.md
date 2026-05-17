# FlowLeadz

Combined public marketing site + multi-tenant CRM for FlowLeadz.

- `/` — public landing page (FlowLeadz marketing site)
- `/login`, `/signup` — auth
- `/customer/*`, `/employee/*`, `/admin/*` — role-scoped CRM

Single Next.js 15 app, deployed to Vercel with Neon Postgres. Phase 1 design spec: `docs/superpowers/specs/2026-05-08-marketing-crm-phase-1-design.md`.

## Local development

Prerequisites: Node 20+, pnpm 9+, Docker.

```bash
# 1. Install deps
pnpm install

# 2. Bring up Postgres (host port 5433 to avoid clashing with a native PG on 5432)
docker compose up -d db

# 3. Configure env
cp .env.example .env
# Generate secrets:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # BETTER_AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"   # CRON_SECRET
# Paste into .env

# 4. Apply migrations
pnpm db:migrate

# 5. Seed e2e test users (admin / employee / customer @e2e.test, password Passw0rd!Test123)
pnpm tsx --env-file=.env scripts/dev-seed.ts

# 6. Run
pnpm dev
```

Open http://localhost:3000.

## Useful scripts

- `pnpm dev` — Next.js dev server
- `pnpm build` — production build
- `pnpm test` — Vitest (unit + service-layer integration)
- `pnpm test:e2e` — Playwright
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — Next/ESLint
- `pnpm db:generate` — Drizzle Kit generate (after schema edits)
- `pnpm db:migrate` — apply migrations
- `pnpm db:studio` — Drizzle Studio
- `pnpm db:seed:admin` — **one-time** first-admin bootstrap for production (see Deployment)
- `pnpm tsx --env-file=.env scripts/dev-seed.ts` — seed local e2e users
- `pnpm tsx --env-file=.env scripts/dev-cleanup.ts` — wipe local e2e data

## Architecture (TL;DR)

Service-layer-first multi-tenant SaaS. Every domain query filters by `org_id`. The only modules that may import `@/lib/db/client` are under `lib/services/**`, `lib/db/**`, and `lib/better-auth/**` — enforced by ESLint's `no-restricted-imports`. Server Actions return `Result<T, AppError>`; no exceptions cross the wire. See the design spec for full rationale.

The public marketing site (FlowLeadz landing) lives in `app/(site)/` as a route group. Its CSS is scoped under `.site-scope` so it cannot leak into the CRM. Both share the same Next.js 15 build and deploy as a single artifact.

## Project layout

```
app/
├── (site)/                            -- public marketing landing (/)
├── (auth)/                            -- login, signup, magic-link, etc.
├── customer/  employee/  admin/       -- role-scoped CRM
├── api/                               -- auth, events stream, contact, cal-webhook, cron
└── post-login/                        -- role-redirect after sign-in
components/
├── site/                              -- FlowLeadz landing components
├── app/                               -- CRM domain components
└── ui/                                -- shadcn/Base UI primitives
lib/
├── db/                                -- Drizzle schema, client, migrations
├── services/                          -- business logic + DB access (only DB consumer)
├── site/                              -- agency lead handlers (Resend, Airtable, Sheets)
└── better-auth/                       -- Better Auth config + react client
tests/                                 -- unit + integration + e2e
docs/superpowers/                      -- specs and plans
scripts/                               -- dev-seed, seed-admin, dev-cleanup
```

## Phase 1 status

| Plan | Scope | Status |
|---|---|---|
| 1 | Foundation (schema, auth, layouts) | ✅ |
| 2a/2b/2c | Domain service layer | ✅ |
| 3a/3b/3c | Role UIs (customer, employee, admin) | ✅ |
| 4 | Cross-cutting UI (notifications, attachments) | ✅ |
| 5a/5b/5c | UX redesign + search + realtime | ✅ |
| 6 Phase A | Merge FlowLeadz public site into the CRM repo | ✅ |
| 6 Phase B | Deploy to Vercel + Neon | ⏳ next |
| 6 Phase C | Decommission Firebase backend, write runbook | ⏳ after deploy |

## Deployment

Target: **Vercel + Neon Postgres + Cloudflare R2**. The full runbook lives at `docs/superpowers/plans/2026-05-17-phase-1-plan-6-merge-and-deploy.md` (Phase B and Phase C).

After deploy, bootstrap the first admin user once:

```bash
DATABASE_URL=<neon prod connection string> \
ADMIN_EMAIL=you@example.com \
ADMIN_PASSWORD=<at least 12 characters> \
ADMIN_NAME="Your Name" \
pnpm db:seed:admin
```

Every subsequent account (employees, customers, additional admins) is created via the Invite User button on the admin dashboard.

## Notes

- Local Docker maps Postgres to host **port 5433** (not 5432) to avoid clashing with a native Postgres install. The container's internal port is still 5432.
- Local dev uses `drizzle-orm/node-postgres`. Production on Neon uses the same standard Postgres connection (not the HTTP transport), because SSE `LISTEN` requires a long-lived client. Connect to Neon's **direct** endpoint (no `-pooler` in the hostname).
- Realtime activity uses Postgres `LISTEN/NOTIFY` piped to the browser via SSE at `/api/events/stream`.
- The marketing site's contact form posts to `/api/contact` (Resend) and `/api/cal-webhook` receives Cal.com booking webhooks.
