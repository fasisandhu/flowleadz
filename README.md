# Marketing CRM

Internal CRM dashboard for a marketing agency. Phase 1 — see `docs/superpowers/specs/2026-05-08-marketing-crm-phase-1-design.md` for the full design.

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

# 5. Run
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

## Architecture (TL;DR)

Service-layer-first multi-tenant SaaS. Every domain query filters by `org_id`. The only modules that may import `@/lib/db/client` are under `lib/services/**`, `lib/db/**`, and `lib/better-auth/**` — enforced by ESLint's `no-restricted-imports`. Server Actions return `Result<T, AppError>`; no exceptions cross the wire. See the design spec for full rationale.

## Project layout

```
app/                                -- Next.js App Router (auth + customer + employee + admin)
lib/db/                             -- Drizzle schema + client + migrations
lib/services/                       -- Business logic + DB access (the only DB consumer)
lib/better-auth/                    -- Better Auth config + react client
lib/{email,storage,notifications}/  -- adapter modules
tests/                              -- unit + integration + e2e
docs/superpowers/                   -- specs and plans
```

## Phase 1 plans

1. ✅ Foundation (this branch)
2. ⏳ Domain service layer
3. ⏳ Customer + employee UIs
4. ⏳ Admin UI + cross-cutting (notifications, attachments)
5. ⏳ Polish (E2E, CI, deploy)

## Notes

- Local docker maps Postgres to host **port 5433** (not 5432) to avoid clashing with a native Postgres install. The container's internal port is still 5432.
- Local dev uses `drizzle-orm/node-postgres`. Production deployment to Vercel + Neon will switch the driver back to `drizzle-orm/neon-http` for edge-compatible HTTP pooling — this is queued for Plan 5.
