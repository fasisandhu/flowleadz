# Phase 1 — Plan 5c: Search & Realtime

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two cross-cutting capabilities that round out Phase 1: full-text search across tasks / daily updates / work requests, and realtime activity-feed + notifications updates via Postgres `LISTEN`/`NOTIFY` + Server-Sent Events.

**Architecture:** Search uses Postgres generated `tsvector` columns + GIN indexes. No background jobs needed — the DB keeps the columns in sync. The service issues role-scoped queries with `ts_headline` for snippet rendering and `ts_rank` for ordering. A single search page per role accepts `?q=…` and renders grouped results.

Realtime uses Postgres `LISTEN`/`NOTIFY` for fan-out + an SSE endpoint that streams to clients. The endpoint opens a dedicated `pg.Client` (NOT a pooled connection — `LISTEN` doesn't survive pool returns) and pipes filtered notifications to the wire. Service-layer code issues `NOTIFY crm_events, '<json>'` alongside its existing DB writes. A single `EventSource` per browser tab subscribes from the role layout; per-component hooks filter events and call `router.refresh()` to re-fetch.

**Tech Stack:** Same as 5a/5b. New runtime usage: Postgres `to_tsvector`, `tsvector`-typed columns, `ts_headline`, `ts_rank`, `plainto_tsquery`, `LISTEN`/`NOTIFY`. New API route: `app/api/events/stream/route.ts` with `runtime = "nodejs"` and `maxDuration = 280`. No new package dependencies — `pg` is already in `package.json` (used by the seed and the existing db client).

**Branch:** Implement on `feat/phase-1-plan-5c-search-realtime`, branched from `main`. Last main commit at start: the Plan-5b merge (`ac54989`).

---

## File structure created by this plan

```
lib/db/
  schema/
    tasks.ts             (MODIFIED — add search_vector generated column)
    daily-updates.ts     (MODIFIED — same)
    work-requests.ts     (MODIFIED — same)
  migrations/
    0006_search_vectors.sql  (NEW — hand-authored; ALTER TABLE … ADD COLUMN …
                              GENERATED ALWAYS AS (…) STORED + GIN indexes)
  listen-client.ts       (NEW — dedicated pg.Client factory for LISTEN)

lib/services/
  search/
    index.ts             (NEW — searchAll service)
    schemas.ts           (NEW — Zod input + result discriminated union)
  realtime/
    notify.ts            (NEW — server-side NOTIFY helper)

lib/server-actions/
  search.ts              (NEW — searchAction + adminSearchAction)

components/app/
  search-input.tsx       (NEW — "use client" — header input with Cmd-K)
  realtime-provider.tsx  (NEW — "use client" — single EventSource per tab via Context)
  realtime-refresh.tsx   (NEW — "use client" — subscribes + calls router.refresh on matching events)

app/api/
  events/stream/route.ts (NEW — SSE endpoint with LISTEN piping)

app/customer/
  search/page.tsx        (NEW)
  layout.tsx             (MODIFIED — add <SearchInput /> + <RealtimeProvider>)

app/employee/
  search/page.tsx        (NEW)
  layout.tsx             (MODIFIED — same)

app/admin/orgs/[orgId]/
  search/page.tsx        (NEW)
  layout.tsx             (MODIFIED — same)

tests/integration/services/
  search/search.test.ts  (NEW — 4-5 search scope tests)
```

---

## Tasks

### Task 1: Schema migration for `tsvector` columns + GIN indexes

**Files:**
- Modify: `lib/db/schema/tasks.ts`, `lib/db/schema/daily-updates.ts`, `lib/db/schema/work-requests.ts` (add generated column declaration)
- Create: `lib/db/migrations/0006_search_vectors.sql` (hand-authored DDL)
- Update: `lib/db/migrations/meta/_journal.json` (new entry — use `when` greater than the largest existing entry; per Plan 5b Task 11 the migrator silently skips entries with smaller timestamps)

The generated columns derive from the source text columns. Postgres keeps them in sync automatically; no application code touches them at write time.

- [ ] **Step 1: Hand-author the migration**

Read `lib/db/migrations/0005_comment_reactions.sql` for format reference. Create `lib/db/migrations/0006_search_vectors.sql`:

```sql
-- Add a generated tsvector column to each searchable entity, populated from
-- the entity's primary text columns. Postgres maintains these automatically.
ALTER TABLE "tasks"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", ''))
  ) STORED;

ALTER TABLE "daily_updates"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("body", ''))) STORED;

ALTER TABLE "work_requests"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", ''))
  ) STORED;

-- GIN indexes for fast `@@` matching.
CREATE INDEX "tasks_search_vector_idx" ON "tasks" USING gin ("search_vector");
CREATE INDEX "daily_updates_search_vector_idx" ON "daily_updates" USING gin ("search_vector");
CREATE INDEX "work_requests_search_vector_idx" ON "work_requests" USING gin ("search_vector");
```

- [ ] **Step 2: Update `_journal.json`**

Read `lib/db/migrations/meta/_journal.json`. Note the largest `when` value among existing entries. Append a new entry with `when` strictly greater than it (use `+1` to be safe — `Date.now()` works if it's larger). Per Plan 5b Task 11: the Drizzle migrator silently skips entries with `when` values out of order.

```json
{
  "idx": 6,
  "version": "7",
  "when": <largest-existing + 1>,
  "tag": "0006_search_vectors",
  "breakpoints": true
}
```

Match the `version` and `breakpoints` fields used by existing entries.

- [ ] **Step 3: Update Drizzle schemas**

Each affected table needs to declare the generated column so consumers can `SELECT` it. Drizzle's `customType` supports `tsvector` via a thin wrapper. For phase 1, the simpler approach is to use the `unknown` type and only project via raw SQL when needed:

Modify `lib/db/schema/tasks.ts`. Find the `tasks` table definition. After the existing columns, add:

```ts
import { sql } from "drizzle-orm";
// Inside pgTable("tasks", { ... }):
// (after the other columns)
searchVector: sql<unknown>`search_vector`.as("search_vector"),  // generated column, read-only
```

Actually — Drizzle doesn't support generated columns natively in `pgTable`. The cleanest approach is to leave the column OUT of the Drizzle schema entirely. The DB has it; queries that need it use raw SQL. This avoids type churn and Drizzle migration-generation conflicts.

**Revised step**: DO NOT modify `lib/db/schema/tasks.ts`, `daily-updates.ts`, `work-requests.ts`. The migration adds the column at the DB layer; the search service queries it via raw SQL.

- [ ] **Step 4: Apply migration**

```bash
pnpm db:migrate
```

If sandbox-blocked, STOP and report — controller will apply it.

Verify:

```bash
docker exec marketing-crm-db psql -U crm -d crm -c "\d tasks" | grep search_vector
docker exec marketing-crm-db psql -U crm -d crm -c "\d daily_updates" | grep search_vector
docker exec marketing-crm-db psql -U crm -d crm -c "\d work_requests" | grep search_vector
```

Each should show `search_vector | tsvector | ... generated always as (...) stored`.

- [ ] **Step 5: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All clean. 222 vitest tests still pass.

```bash
git checkout -b feat/phase-1-plan-5c-search-realtime
git add lib/db/migrations
git commit -m "feat(search): tsvector + GIN indexes on tasks, daily_updates, work_requests"
```

NOTE: the controller has already created the branch. Skip `git checkout -b`.

---

### Task 2: Search service — types, query, role scoping

**Files:**
- Create: `lib/services/search/schemas.ts`
- Create: `lib/services/search/index.ts`
- Create: `tests/integration/services/search/search.test.ts`

Implement `searchAll(db, ctx, { query, limit }): Result<SearchResult[]>` where `SearchResult` is a discriminated union over `task | update | work_request`. Role-scoping mirrors the existing list services:

- **Customer:** tasks/updates/requests in their org. Tasks gated by `customerVisible = true` + `isNotNull(projectId)`. Updates gated by `visibility = 'customer_visible'`. Requests submitted by anyone in their org.
- **Employee:** tasks on their assigned projects. Updates on their assigned projects. Requests in their org (employees see all org requests).
- **Admin (via `staffOrgId`):** everything in the org. No customer-visibility filter.

The query uses `plainto_tsquery('english', $1)` to parse the user input safely (no chance of injection-via-tsquery-syntax). `ts_rank` orders by relevance. `ts_headline` produces a snippet with `<mark>...</mark>` around matches.

- [ ] **Step 1: Failing tests (TDD)**

Create `tests/integration/services/search/search.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import * as schema from "@/lib/db/schema";
import { withTransaction } from "@/tests/fixtures/db";
import {
  createMembership,
  createOrg,
  createProject,
  createUser,
} from "@/tests/fixtures/factories";
import { searchAll } from "@/lib/services/search";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("search.searchAll", () => {
  test("matches a task by title for admin", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const project = await createProject(tx, org.id, admin.id);
      await tx.insert(schema.tasks).values({
        orgId: org.id,
        projectId: project.id,
        title: "Build the pricing page",
        description: "Hero, plans, CTA",
        source: "admin_created",
        createdBy: admin.id,
      });

      const r = await searchAll(tx, ctxOf(org.id, "admin", admin.id), { query: "pricing", limit: 10 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const taskHits = r.data.filter((x) => x.kind === "task");
      expect(taskHits.length).toBe(1);
      expect(taskHits[0]!.title).toBe("Build the pricing page");
    });
  });

  test("hides internal_only updates from customer", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const customer = await createUser(tx, { role: "customer" });
      await createMembership(tx, customer.id, org.id);
      const project = await createProject(tx, org.id, admin.id);
      await tx.insert(schema.dailyUpdates).values({
        orgId: org.id,
        projectId: project.id,
        userId: admin.id,
        body: "Internal pricing strategy meeting notes",
        activityType: "meeting",
        visibility: "internal_only",
        logDate: "2026-05-10",
      });

      const r = await searchAll(tx, ctxOf(org.id, "customer", customer.id), { query: "pricing", limit: 10 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.filter((x) => x.kind === "update").length).toBe(0);
    });
  });

  test("employee only sees results from assigned projects", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const employee = await createUser(tx, { role: "employee" });
      const assignedProject = await createProject(tx, org.id, admin.id);
      const otherProject = await createProject(tx, org.id, admin.id);
      await tx.insert(schema.projectAssignments).values({
        userId: employee.id,
        projectId: assignedProject.id,
      });
      await tx.insert(schema.tasks).values({
        orgId: org.id,
        projectId: assignedProject.id,
        title: "Assigned pricing task",
        source: "admin_created",
        createdBy: admin.id,
      });
      await tx.insert(schema.tasks).values({
        orgId: org.id,
        projectId: otherProject.id,
        title: "Unassigned pricing task",
        source: "admin_created",
        createdBy: admin.id,
      });

      const r = await searchAll(tx, ctxOf(org.id, "employee", employee.id), { query: "pricing", limit: 10 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const titles = r.data.filter((x) => x.kind === "task").map((x) => x.title);
      expect(titles).toContain("Assigned pricing task");
      expect(titles).not.toContain("Unassigned pricing task");
    });
  });

  test("empty query returns empty result without error", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const r = await searchAll(tx, ctxOf(org.id, "admin", admin.id), { query: "", limit: 10 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toEqual([]);
    });
  });

  test("validates query length", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const r = await searchAll(tx, ctxOf(org.id, "admin", admin.id), {
        query: "x".repeat(501),
        limit: 10,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm test tests/integration/services/search/search.test.ts
```

Expected: all 5 fail with "Cannot find module '@/lib/services/search'".

- [ ] **Step 3: Schemas**

Create `lib/services/search/schemas.ts`:

```ts
import { z } from "zod";

export const searchInputSchema = z.object({
  query: z.string().max(500),
  limit: z.number().int().min(1).max(50).default(20),
});

export type SearchInput = z.infer<typeof searchInputSchema>;

export type SearchResult =
  | {
      kind: "task";
      id: string;
      title: string;
      snippet: string;
      rank: number;
      projectId: string | null;
    }
  | {
      kind: "update";
      id: string;
      snippet: string;
      rank: number;
      projectId: string;
    }
  | {
      kind: "work_request";
      id: string;
      title: string;
      snippet: string;
      rank: number;
    };
```

- [ ] **Step 4: Service implementation**

Create `lib/services/search/index.ts`:

```ts
import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireOrgAccess } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { searchInputSchema, type SearchInput, type SearchResult } from "./schemas";

export type { SearchInput, SearchResult } from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function searchAll(
  db: AnyDb,
  ctx: OrgContext,
  input: SearchInput,
): Promise<Result<SearchResult[]>> {
  const parsed = searchInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  if (parsed.data.query.trim() === "") return ok([]);

  const access = await requireOrgAccess(db, ctx);
  if (!access.ok) return access;

  const q = parsed.data.query;
  const orgId = ctx.orgId;
  const limit = parsed.data.limit;

  // We build three separate queries (one per entity), apply role-scoping per
  // entity in the WHERE clause, then UNION ALL in-memory.

  const taskRows = await (async () => {
    if (ctx.actor.role === "customer") {
      return db.execute(sql`
        SELECT 'task' AS kind, ${schema.tasks.id} AS id, ${schema.tasks.title} AS title,
               ${schema.tasks.projectId} AS "projectId",
               ts_headline('english',
                 coalesce(${schema.tasks.title}, '') || ' ' || coalesce(${schema.tasks.description}, ''),
                 plainto_tsquery('english', ${q}),
                 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
               ) AS snippet,
               ts_rank(${schema.tasks.searchVector}, plainto_tsquery('english', ${q})) AS rank
        FROM ${schema.tasks}
        WHERE ${schema.tasks.orgId} = ${orgId}
          AND ${schema.tasks.customerVisible} = true
          AND ${schema.tasks.projectId} IS NOT NULL
          AND ${schema.tasks.searchVector} @@ plainto_tsquery('english', ${q})
        ORDER BY rank DESC
        LIMIT ${limit}
      `);
    }
    if (ctx.actor.role === "employee") {
      return db.execute(sql`
        SELECT 'task' AS kind, t.id AS id, t.title AS title,
               t.project_id AS "projectId",
               ts_headline('english',
                 coalesce(t.title, '') || ' ' || coalesce(t.description, ''),
                 plainto_tsquery('english', ${q}),
                 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
               ) AS snippet,
               ts_rank(t.search_vector, plainto_tsquery('english', ${q})) AS rank
        FROM tasks t
        INNER JOIN project_assignments pa ON pa.project_id = t.project_id
        WHERE t.org_id = ${orgId}
          AND pa.user_id = ${ctx.actor.userId}
          AND t.search_vector @@ plainto_tsquery('english', ${q})
        ORDER BY rank DESC
        LIMIT ${limit}
      `);
    }
    // admin
    return db.execute(sql`
      SELECT 'task' AS kind, id, title, project_id AS "projectId",
             ts_headline('english',
               coalesce(title, '') || ' ' || coalesce(description, ''),
               plainto_tsquery('english', ${q}),
               'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
             ) AS snippet,
             ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
      FROM tasks
      WHERE org_id = ${orgId}
        AND search_vector @@ plainto_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);
  })();

  const updateRows = await (async () => {
    if (ctx.actor.role === "customer") {
      return db.execute(sql`
        SELECT 'update' AS kind, id, project_id AS "projectId",
               ts_headline('english', coalesce(body, ''), plainto_tsquery('english', ${q}),
                 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
               ) AS snippet,
               ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
        FROM daily_updates
        WHERE org_id = ${orgId}
          AND visibility = 'customer_visible'
          AND search_vector @@ plainto_tsquery('english', ${q})
        ORDER BY rank DESC
        LIMIT ${limit}
      `);
    }
    if (ctx.actor.role === "employee") {
      return db.execute(sql`
        SELECT 'update' AS kind, d.id, d.project_id AS "projectId",
               ts_headline('english', coalesce(d.body, ''), plainto_tsquery('english', ${q}),
                 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
               ) AS snippet,
               ts_rank(d.search_vector, plainto_tsquery('english', ${q})) AS rank
        FROM daily_updates d
        INNER JOIN project_assignments pa ON pa.project_id = d.project_id
        WHERE d.org_id = ${orgId}
          AND pa.user_id = ${ctx.actor.userId}
          AND d.search_vector @@ plainto_tsquery('english', ${q})
        ORDER BY rank DESC
        LIMIT ${limit}
      `);
    }
    // admin
    return db.execute(sql`
      SELECT 'update' AS kind, id, project_id AS "projectId",
             ts_headline('english', coalesce(body, ''), plainto_tsquery('english', ${q}),
               'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
             ) AS snippet,
             ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
      FROM daily_updates
      WHERE org_id = ${orgId}
        AND search_vector @@ plainto_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);
  })();

  const workRequestRows = await db.execute(sql`
    SELECT 'work_request' AS kind, id, title,
           ts_headline('english',
             coalesce(title, '') || ' ' || coalesce(description, ''),
             plainto_tsquery('english', ${q}),
             'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
           ) AS snippet,
           ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
    FROM work_requests
    WHERE org_id = ${orgId}
      AND search_vector @@ plainto_tsquery('english', ${q})
    ORDER BY rank DESC
    LIMIT ${limit}
  `);

  const results: SearchResult[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of taskRows.rows as any[]) {
    results.push({
      kind: "task",
      id: r.id,
      title: r.title,
      snippet: r.snippet,
      rank: Number(r.rank),
      projectId: r.projectId ?? null,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of updateRows.rows as any[]) {
    results.push({
      kind: "update",
      id: r.id,
      snippet: r.snippet,
      rank: Number(r.rank),
      projectId: r.projectId,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of workRequestRows.rows as any[]) {
    results.push({
      kind: "work_request",
      id: r.id,
      title: r.title,
      snippet: r.snippet,
      rank: Number(r.rank),
    });
  }

  // Merge + sort by rank descending, slice to overall limit.
  results.sort((a, b) => b.rank - a.rank);
  return ok(results.slice(0, limit));
}
```

NOTE on the Drizzle column references: `${schema.tasks.id}` inside `sql\`…\`` expands to the qualified column name. For places where Drizzle's column-ref syntax gets awkward (the employee branch uses an alias and explicit join), the SQL uses bare column names. Both forms are valid as long as they reference the right column in the active query.

If your Drizzle version doesn't support `${schema.tasks.searchVector}` because the column isn't in the schema declaration (Task 1 Step 3 decided NOT to add it), use raw column names like `search_vector` instead. The customer branch above already mixes both — adjust to use bare names if needed: replace `${schema.tasks.searchVector}` with `search_vector`, `${schema.tasks.customerVisible}` with `customer_visible`, etc.

Actually for consistency: use bare snake_case column names throughout the raw SQL blocks. Cleaner and avoids the Drizzle column-not-in-schema problem. Rewrite the customer branch:

```ts
return db.execute(sql`
  SELECT 'task' AS kind, id, title, project_id AS "projectId",
         ts_headline('english',
           coalesce(title, '') || ' ' || coalesce(description, ''),
           plainto_tsquery('english', ${q}),
           'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
         ) AS snippet,
         ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
  FROM tasks
  WHERE org_id = ${orgId}
    AND customer_visible = true
    AND project_id IS NOT NULL
    AND search_vector @@ plainto_tsquery('english', ${q})
  ORDER BY rank DESC
  LIMIT ${limit}
`);
```

Apply this convention to all three branches (customer, employee, admin) on both tasks and updates. Bare snake_case column names everywhere.

- [ ] **Step 5: Tests pass**

```bash
pnpm test tests/integration/services/search/search.test.ts
```

5/5 pass.

- [ ] **Step 6: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git add lib/services/search tests/integration/services/search
git commit -m "feat(search): searchAll service with role-scoped queries + ts_headline snippets"
```

Expected: 222 + 5 = 227 vitest tests passing.

---

### Task 3: Server-action wrappers + search pages

**Files:**
- Create: `lib/server-actions/search.ts`
- Create: `app/customer/search/page.tsx`, `app/employee/search/page.tsx`, `app/admin/orgs/[orgId]/search/page.tsx`

The customer / employee variants use the existing `withSessionContext` (no `staffOrgId`). The admin variant uses `staffOrgId: orgId`.

- [ ] **Step 1: Server actions**

Create `lib/server-actions/search.ts`:

```ts
"use server";

import { withSessionContext } from "./_action";
import * as search from "@/lib/services/search";

export async function searchAction(input: search.SearchInput) {
  return withSessionContext((db, ctx) => search.searchAll(db, ctx, input));
}

export async function adminSearchAction(orgId: string, input: search.SearchInput) {
  return withSessionContext(
    (db, ctx) => search.searchAll(db, ctx, input),
    { staffOrgId: orgId },
  );
}
```

- [ ] **Step 2: Customer search page**

Create `app/customer/search/page.tsx`:

```tsx
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { EmptySearchIllustration } from "@/components/app/illustrations/empty-search";
import { searchAction } from "@/lib/server-actions/search";

const KIND_LABELS: Record<string, string> = {
  task: "Task",
  update: "Update",
  work_request: "Work request",
};

function hrefFor(kind: string, row: { id: string; projectId?: string | null }): string {
  if (kind === "task") return `/customer/tasks/${row.id}`;
  if (kind === "update" && row.projectId) return `/customer/projects/${row.projectId}/updates/${row.id}`;
  if (kind === "work_request") return `/customer/requests/${row.id}`;
  return "#";
}

export default async function CustomerSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const r = query
    ? await searchAction({ query, limit: 50 })
    : { ok: true as const, data: [] };
  const results = r.ok ? r.data : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Search" subtitle={query ? `Results for "${query}"` : "Type a query above."} />

      {query === "" ? (
        <EmptyState
          illustration={EmptySearchIllustration}
          title="Start typing"
          description="Search across tasks, updates, and work requests in your org."
        />
      ) : results.length === 0 ? (
        <EmptyState
          illustration={EmptySearchIllustration}
          title="No matches"
          description="Try different keywords or check your spelling."
        />
      ) : (
        <ul className="space-y-2">
          {results.map((res) => {
            const title =
              res.kind === "update"
                ? "Daily update"
                : (res.kind === "task" || res.kind === "work_request") && "title" in res
                  ? res.title
                  : res.kind;
            const href = hrefFor(res.kind, res as { id: string; projectId?: string | null });
            return (
              <li
                key={`${res.kind}-${res.id}`}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
              >
                <Link href={href} className="block">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      {KIND_LABELS[res.kind]}
                    </span>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-50">
                      {title}
                    </span>
                  </div>
                  <p
                    className="text-xs text-slate-600 dark:text-slate-300 [&>mark]:bg-amber-100 [&>mark]:text-amber-900 [&>mark]:dark:bg-amber-900/40 [&>mark]:dark:text-amber-200"
                    // ts_headline returns HTML with <mark> tags around matches.
                    // The query input is parsed via plainto_tsquery (no injection vector);
                    // body content was sanitized at write time.
                    dangerouslySetInnerHTML={{ __html: res.snippet }}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

NOTE: `dangerouslySetInnerHTML` here is safe because the snippet content originates from text-only columns (body / title / description) that are stored as-is — they can contain user text but not HTML (the rendering elsewhere uses `whitespace-pre-wrap` to preserve newlines without parsing HTML). `ts_headline` wraps matches in `<mark>` and outputs the rest as plain text. The only XSS surface would be a literal `<script>` in the source body; this is acceptable for Phase 1 internal-CRM scope but is a known Phase-2 hardening item — see the spec's risks section.

Wait — that's not actually safe. User-supplied content goes through `dangerouslySetInnerHTML` without escaping. A daily update body containing `<script>alert(1)</script>` would execute. Fix: post-process the snippet to escape everything EXCEPT the `<mark>` tags.

Replace the rendering with a safe variant:

```tsx
function renderSnippet(html: string): React.ReactNode {
  // ts_headline returns text with <mark> wrapped around matches. Split on
  // those tags and escape the rest. Anything else is treated as text.
  const parts = html.split(/(<mark>.*?<\/mark>)/g);
  return parts.map((part, i) => {
    if (part.startsWith("<mark>") && part.endsWith("</mark>")) {
      return (
        <mark
          key={i}
          className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
        >
          {part.slice("<mark>".length, -"</mark>".length)}
        </mark>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
```

Then in the JSX:

```tsx
<p className="text-xs text-slate-600 dark:text-slate-300">
  {renderSnippet(res.snippet)}
</p>
```

Add `import * as React from "react";` at the top if not present.

The split regex matches the exact `<mark>...</mark>` markers that `ts_headline` produces (we set `StartSel=<mark>, StopSel=</mark>` in the query). Anything between or outside those markers is rendered as plain React text, which React escapes automatically.

Use this safe renderer in the customer page above. (Replace the `dangerouslySetInnerHTML` block.)

- [ ] **Step 3: Employee search page**

Same shape as customer but routes differ. Create `app/employee/search/page.tsx`:

```tsx
import Link from "next/link";
import * as React from "react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { EmptySearchIllustration } from "@/components/app/illustrations/empty-search";
import { searchAction } from "@/lib/server-actions/search";

const KIND_LABELS: Record<string, string> = {
  task: "Task",
  update: "Update",
  work_request: "Work request",
};

function hrefFor(kind: string, row: { id: string; projectId?: string | null }): string {
  if (kind === "task") return `/employee/tasks/${row.id}`;
  if (kind === "update" && row.projectId) return `/employee/projects/${row.projectId}/updates/${row.id}`;
  if (kind === "work_request") return `#`; // employees don't have a work-request detail page in 5b
  return "#";
}

function renderSnippet(html: string): React.ReactNode {
  const parts = html.split(/(<mark>.*?<\/mark>)/g);
  return parts.map((part, i) => {
    if (part.startsWith("<mark>") && part.endsWith("</mark>")) {
      return (
        <mark key={i} className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          {part.slice(6, -7)}
        </mark>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export default async function EmployeeSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const r = query
    ? await searchAction({ query, limit: 50 })
    : { ok: true as const, data: [] };
  const results = r.ok ? r.data : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Search" subtitle={query ? `Results for "${query}"` : "Type a query above."} />

      {query === "" ? (
        <EmptyState illustration={EmptySearchIllustration} title="Start typing" description="Search across your tasks, updates, and work requests." />
      ) : results.length === 0 ? (
        <EmptyState illustration={EmptySearchIllustration} title="No matches" description="Try different keywords or check your spelling." />
      ) : (
        <ul className="space-y-2">
          {results.map((res) => {
            const title =
              res.kind === "update"
                ? "Daily update"
                : (res.kind === "task" || res.kind === "work_request") && "title" in res
                  ? res.title
                  : res.kind;
            const href = hrefFor(res.kind, res as { id: string; projectId?: string | null });
            return (
              <li
                key={`${res.kind}-${res.id}`}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
              >
                <Link href={href} className="block">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      {KIND_LABELS[res.kind]}
                    </span>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-50">
                      {title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {renderSnippet(res.snippet)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Admin search page**

Create `app/admin/orgs/[orgId]/search/page.tsx`:

```tsx
import Link from "next/link";
import * as React from "react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { EmptySearchIllustration } from "@/components/app/illustrations/empty-search";
import { adminSearchAction } from "@/lib/server-actions/search";

const KIND_LABELS: Record<string, string> = {
  task: "Task",
  update: "Update",
  work_request: "Work request",
};

function hrefFor(orgId: string, kind: string, row: { id: string; projectId?: string | null }): string {
  if (kind === "task") return `/admin/orgs/${orgId}/tasks/${row.id}`;
  if (kind === "update" && row.projectId) return `/admin/orgs/${orgId}/projects/${row.projectId}`;
  if (kind === "work_request") return `/admin/orgs/${orgId}/work-requests/${row.id}`;
  return "#";
}

function renderSnippet(html: string): React.ReactNode {
  const parts = html.split(/(<mark>.*?<\/mark>)/g);
  return parts.map((part, i) => {
    if (part.startsWith("<mark>") && part.endsWith("</mark>")) {
      return (
        <mark key={i} className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          {part.slice(6, -7)}
        </mark>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export default async function AdminSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { orgId } = await params;
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const r = query
    ? await adminSearchAction(orgId, { query, limit: 50 })
    : { ok: true as const, data: [] };
  const results = r.ok ? r.data : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Search" subtitle={query ? `Results for "${query}"` : "Type a query above."} />

      {query === "" ? (
        <EmptyState illustration={EmptySearchIllustration} title="Start typing" description="Search everything in this org." />
      ) : results.length === 0 ? (
        <EmptyState illustration={EmptySearchIllustration} title="No matches" description="Try different keywords or check your spelling." />
      ) : (
        <ul className="space-y-2">
          {results.map((res) => {
            const title =
              res.kind === "update"
                ? "Daily update"
                : (res.kind === "task" || res.kind === "work_request") && "title" in res
                  ? res.title
                  : res.kind;
            const href = hrefFor(orgId, res.kind, res as { id: string; projectId?: string | null });
            return (
              <li
                key={`${res.kind}-${res.id}`}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
              >
                <Link href={href} className="block">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      {KIND_LABELS[res.kind]}
                    </span>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-50">
                      {title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {renderSnippet(res.snippet)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add lib/server-actions/search.ts app/customer/search app/employee/search "app/admin/orgs/[orgId]/search"
git commit -m "feat(search): per-role search page with ts_headline snippet rendering"
```

---

### Task 4: Header search input with Cmd/Ctrl-K

**Files:**
- Create: `components/app/search-input.tsx` (`"use client"`)
- Modify: `app/customer/layout.tsx`, `app/employee/layout.tsx`, `app/admin/orgs/[orgId]/layout.tsx` — insert `<SearchInput />`

A small text input in the header that submits to the role's search page. Cmd-K (or Ctrl-K) focuses the input from anywhere on the page.

- [ ] **Step 1: SearchInput component**

Create `components/app/search-input.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function SearchInput({
  searchHref,
  className,
}: {
  searchHref: string;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`${searchHref}?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={onSubmit} className={cn("relative hidden md:block", className)}>
      <Search
        className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        aria-label="Search"
        className={cn(
          "h-8 w-48 rounded-md border border-slate-200 bg-white pl-7 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none",
          "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-indigo-400",
        )}
      />
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
      >
        ⌘K
      </kbd>
    </form>
  );
}
```

The `hidden md:block` makes the search input desktop-only — mobile users get it via the hamburger sheet (extending the sheet to include a Search link in Task 8 is optional polish; not in scope here).

- [ ] **Step 2: Insert into each layout**

For each of `app/customer/layout.tsx`, `app/employee/layout.tsx`, `app/admin/orgs/[orgId]/layout.tsx`:

Add `import { SearchInput } from "@/components/app/search-input";`.

Find the right-side cluster of the header (where ThemeToggle + NotificationsBell sit). Insert `<SearchInput searchHref="..." />` BEFORE ThemeToggle:

Customer:
```tsx
<SearchInput searchHref="/customer/search" />
<ThemeToggle />
<NotificationsBell ... />
```

Employee:
```tsx
<SearchInput searchHref="/employee/search" />
<ThemeToggle />
<NotificationsBell ... />
```

Admin (use the `orgId` from params):
```tsx
<SearchInput searchHref={`/admin/orgs/${orgId}/search`} />
<ThemeToggle />
<NotificationsBell ... />
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add components/app/search-input.tsx app/customer/layout.tsx app/employee/layout.tsx "app/admin/orgs/[orgId]/layout.tsx"
git commit -m "feat(search): header SearchInput with Cmd-K focus shortcut"
```

---

### Task 5: Realtime — dedicated pg.Client + LISTEN helper

**Files:**
- Create: `lib/db/listen-client.ts`
- Create: `lib/services/realtime/notify.ts`

`LISTEN` requires a dedicated connection. The existing `lib/db/client.ts` uses a node-postgres pool — connections are returned after each query. `LISTEN` registered on a pooled connection gets cleared when the connection is returned.

The SSE route handler (Task 6) will create a fresh `pg.Client` per connection, call `LISTEN crm_events`, and pipe notifications to the wire.

`NOTIFY` is fire-and-forget. Service code can use the pool for it.

- [ ] **Step 1: listen-client.ts**

Create `lib/db/listen-client.ts`:

```ts
import "server-only";
import { Client } from "pg";

/**
 * Create a dedicated, non-pooled pg.Client suitable for LISTEN.
 *
 * Caller MUST end() the client when the consumer disconnects.
 */
export function createListenClient(): Client {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new Client({ connectionString });
}
```

- [ ] **Step 2: notify helper**

Create `lib/services/realtime/notify.ts`:

```ts
import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export type RealtimePayload =
  | {
      kind: "activity";
      orgId: string;
      taskId: string;
      eventKind: "update" | "status_change" | "time_log" | "comment" | "attachment";
    }
  | {
      kind: "notification";
      orgId: string;
      userId: string;
    };

/**
 * Issue a Postgres NOTIFY on the `crm_events` channel with a JSON payload.
 *
 * Safe to call inside the same DB transaction as the originating write —
 * the notification is queued until commit. Idempotent if you call it twice
 * for the same event (the SSE consumer will receive both).
 */
export async function notify(db: AnyDb, payload: RealtimePayload): Promise<void> {
  // pg_notify is the function form of NOTIFY — accepts a parameter, so we can
  // bind the payload safely without manual string escaping.
  await db.execute(sql`SELECT pg_notify('crm_events', ${JSON.stringify(payload)})`);
}
```

`pg_notify(channel, payload)` is the SQL function form of NOTIFY. Unlike the bare `NOTIFY` statement it accepts parameters via bind variables, so the JSON payload can contain quotes and special characters safely.

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add lib/db/listen-client.ts lib/services/realtime
git commit -m "feat(realtime): listen-client factory + notify helper (pg_notify wrapper)"
```

---

### Task 6: SSE endpoint that pipes LISTEN to the wire

**Files:**
- Create: `app/api/events/stream/route.ts`

The endpoint:
1. Authenticates the request (Better Auth session must exist)
2. Opens a dedicated `pg.Client`
3. Runs `LISTEN crm_events`
4. Pipes notifications into the SSE stream, filtered to events relevant to the user
5. Sends a `: keepalive` comment every 25 seconds (prevents proxies / load balancers from closing the connection)
6. On Vercel: returns control after ~280s with a `retry: 1000` directive so the client reconnects

- [ ] **Step 1: Route handler**

Create `app/api/events/stream/route.ts`:

```ts
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/config";
import { createListenClient } from "@/lib/db/listen-client";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildOrgContext } from "@/lib/services/_auth/build-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 280; // Vercel Pro cap is 300s; leave headroom.

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Resolve the actor's org context so we can filter events server-side.
  const ctx = await buildOrgContext(db, { userId: session.user.id });
  if (!ctx) {
    return new Response("No organization context", { status: 403 });
  }

  const userId = ctx.actor.userId;
  const orgId = ctx.orgId;

  const listenClient = createListenClient();
  await listenClient.connect();
  await listenClient.query("LISTEN crm_events");

  // Track whether the stream is closed so we don't keep pushing into a dead pipe.
  let closed = false;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Initial retry hint.
      controller.enqueue(encoder.encode("retry: 1000\n\n"));

      const onNotification = (msg: { channel: string; payload?: string }) => {
        if (closed || msg.channel !== "crm_events" || !msg.payload) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(msg.payload);
        } catch {
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = parsed as any;
        if (typeof p?.orgId !== "string") return;
        // Filter: only this user's org. Drop everything else.
        if (p.orgId !== orgId) return;
        // For notification events, only this user.
        if (p.kind === "notification" && p.userId !== userId) return;
        controller.enqueue(encoder.encode(`data: ${msg.payload}\n\n`));
      };

      listenClient.on("notification", onNotification);
      listenClient.on("error", () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      // Keepalive every 25 seconds — many load balancers idle-close at 30-60s.
      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // already closed
        }
      }, 25_000);

      // Cleanup on close.
      const cleanup = () => {
        closed = true;
        clearInterval(keepalive);
        listenClient.removeAllListeners();
        listenClient
          .end()
          .catch(() => {
            /* best effort */
          });
      };

      // Hard timeout — reconnect before Vercel kills us.
      const hardTimeout = setTimeout(() => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }, (maxDuration - 5) * 1000);

      // If client disconnects, ReadableStream's cancel() fires.
      (controller as unknown as { __cleanup: () => void }).__cleanup = () => {
        clearTimeout(hardTimeout);
        cleanup();
      };
    },
    cancel() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = this as unknown as { __cleanup?: () => void };
      c.__cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
```

NOTE on the cleanup pattern: `ReadableStream`'s `cancel` doesn't have access to local closures from `start`. We stash a cleanup function on the controller (with a typing assertion). When `cancel` fires (client disconnects, browser tab closes), it calls the stashed cleanup. The hard timeout independently fires the same cleanup before Vercel's route timeout.

- [ ] **Step 2: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

The route compiles. Functional verification comes in Task 9 (E2E or manual smoke).

- [ ] **Step 3: Commit**

```bash
git add app/api/events/stream/route.ts
git commit -m "feat(realtime): SSE endpoint that pipes LISTEN crm_events to client"
```

---

### Task 7: Wire `notify()` into service writes

**Files:**
- Modify: `lib/services/notifications/index.ts` — `emit()` issues notify() per in-app delivery
- Modify: `lib/services/tasks/index.ts` — `changeTaskStatus` notifies activity
- Modify: `lib/services/time-entries/index.ts` — `logTime` notifies activity
- Modify: `lib/services/comments/index.ts` — `postComment` notifies activity
- Modify: `lib/services/daily-updates/index.ts` — `createDailyUpdate` notifies activity
- Modify: `lib/services/attachments/index.ts` — `confirm` notifies activity (when ready)

Each write path that produces a feed-visible event ALSO calls `notify()` with the right payload. The SSE consumers filter and decide what to react to.

For each modification: import `notify` from `@/lib/services/realtime/notify`, then after the successful write, call it. Wrap in try/catch — a `notify()` failure (e.g., Postgres briefly unavailable) should NOT fail the originating action.

- [ ] **Step 1: emit() in notifications**

Read `lib/services/notifications/index.ts`. Find the `emit` function. After the in-app insert block (where we now have `inAppNotifIds`), add a notify() call per recipient:

```ts
import { notify } from "@/lib/services/realtime/notify";

// Inside emit(), after the in_app deliveries are inserted:
for (const row of inAppNotifIds) {
  try {
    await notify(db, { kind: "notification", orgId: parsed.orgId, userId: row.userId });
  } catch {
    // best effort — never break the originating action on a notify failure
  }
}
```

- [ ] **Step 2: changeTaskStatus**

Read `lib/services/tasks/index.ts`. Find `changeTaskStatus`. After the status log insert, add:

```ts
try {
  await notify(db, {
    kind: "activity",
    orgId: ctx.orgId,
    taskId: parsed.data.id,
    eventKind: "status_change",
  });
} catch {
  /* best effort */
}
```

Place this BEFORE the function returns `ok(...)`.

- [ ] **Step 3: logTime**

Read `lib/services/time-entries/index.ts`. Find `logTime`. After the insert, add:

```ts
try {
  await notify(db, {
    kind: "activity",
    orgId: ctx.orgId,
    taskId: parsed.data.taskId,
    eventKind: "time_log",
  });
} catch {
  /* best effort */
}
```

- [ ] **Step 4: postComment**

Read `lib/services/comments/index.ts`. Find `postComment`. After the comment insert AND after the existing `emit()` call (which fires notifications), add:

```ts
// Realtime activity fan-out: only fires when the comment is on a task or
// a task-linked daily update. We don't notify orphan daily-update comments
// (rare in practice — daily updates are always task-linked in Phase 1).
if (parsed.data.parentType === "task") {
  try {
    await notify(db, {
      kind: "activity",
      orgId: ctx.orgId,
      taskId: parsed.data.parentId,
      eventKind: "comment",
    });
  } catch {
    /* best effort */
  }
} else if (parsed.data.parentType === "daily_update") {
  // Find all tasks linked to this update and notify each.
  const links = await db
    .select({ taskId: schema.dailyUpdateTasks.taskId })
    .from(schema.dailyUpdateTasks)
    .where(eq(schema.dailyUpdateTasks.dailyUpdateId, parsed.data.parentId));
  for (const link of links) {
    try {
      await notify(db, {
        kind: "activity",
        orgId: ctx.orgId,
        taskId: link.taskId,
        eventKind: "comment",
      });
    } catch {
      /* best effort */
    }
  }
}
```

Add `import { eq } from "drizzle-orm";` if not already imported.

- [ ] **Step 5: createDailyUpdate**

Read `lib/services/daily-updates/index.ts`. Find `createDailyUpdate`. After the daily-update insert AND the task-link inserts (the existing code inserts into `daily_update_tasks` if `taskIds` was provided), notify EACH linked task:

```ts
// After the link inserts:
if (parsed.data.taskIds && parsed.data.taskIds.length > 0) {
  for (const taskId of parsed.data.taskIds) {
    try {
      await notify(db, {
        kind: "activity",
        orgId: ctx.orgId,
        taskId,
        eventKind: "update",
      });
    } catch {
      /* best effort */
    }
  }
}
```

If the existing code shape differs (the task-links may be inserted in a different place), adapt — the goal is to fire notify() once per linked task after the daily update is committed.

- [ ] **Step 6: confirm attachment**

Read `lib/services/attachments/index.ts`. Find `confirm`. After the status update to `'ready'`, if the parent_type is `'task'`, notify:

```ts
if (row.parentType === "task") {
  try {
    await notify(db, {
      kind: "activity",
      orgId: ctx.orgId,
      taskId: row.parentId,
      eventKind: "attachment",
    });
  } catch {
    /* best effort */
  }
}
```

If `row` is shadowed in the function, use whichever variable holds the row that was just confirmed.

- [ ] **Step 7: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All clean. 227 vitest tests still pass (no test changes; the notify() calls are silent under the global mock since none of the integration tests subscribe to LISTEN).

```bash
git add lib/services
git commit -m "feat(realtime): notify on activity events (status change, time log, comment, update, attachment, notification)"
```

---

### Task 8: Client subscription — provider + refresh hooks

**Files:**
- Create: `components/app/realtime-provider.tsx` (`"use client"`)
- Create: `components/app/realtime-refresh.tsx` (`"use client"` — generic component)
- Modify: each role layout — wrap children in `<RealtimeProvider>`

The provider opens one `EventSource` per tab and exposes the stream via React Context. Components subscribe to events matching their filter (taskId for ActivityFeed, "notifications" for the bell).

For 5c simplicity, instead of a Context+hook API, the layout drops in a small `<RealtimeRefresh>` component that subscribes once and calls `router.refresh()` whenever ANY relevant event arrives. The granularity loss (no per-component filtering) is acceptable — `router.refresh()` is cheap and only the visible Server Components re-render.

- [ ] **Step 1: RealtimeProvider**

Create `components/app/realtime-provider.tsx`:

```tsx
"use client";

import * as React from "react";

type Listener = (data: unknown) => void;

type RealtimeContextValue = {
  subscribe: (listener: Listener) => () => void;
};

const RealtimeContext = React.createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = React.useRef<Set<Listener>>(new Set());
  const sourceRef = React.useRef<EventSource | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const source = new EventSource("/api/events/stream");
      sourceRef.current = source;

      source.onmessage = (e) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(e.data);
        } catch {
          return;
        }
        for (const listener of listenersRef.current) {
          try {
            listener(parsed);
          } catch {
            /* listener errors don't break the stream */
          }
        }
      };

      source.onerror = () => {
        // EventSource auto-reconnects on transient errors. But if the server
        // closed cleanly (302/404/403), browser may not retry — explicit close
        // + reconnect after a delay handles that case.
        source.close();
        sourceRef.current = null;
        setTimeout(() => {
          if (!cancelled) connect();
        }, 2000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, []);

  const value = React.useMemo<RealtimeContextValue>(
    () => ({
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    }),
    [],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = React.useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtime must be used inside <RealtimeProvider>");
  }
  return ctx;
}
```

- [ ] **Step 2: RealtimeRefresh**

Create `components/app/realtime-refresh.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "./realtime-provider";

/**
 * Subscribes to the SSE stream and calls router.refresh() whenever ANY event
 * arrives. Coarse-grained but cheap: only the visible Server Components
 * re-render on each refresh.
 *
 * Place inside <RealtimeProvider>. One per role layout is sufficient.
 */
export function RealtimeRefresh() {
  const router = useRouter();
  const realtime = useRealtime();

  React.useEffect(() => {
    return realtime.subscribe(() => {
      router.refresh();
    });
  }, [realtime, router]);

  return null;
}
```

- [ ] **Step 3: Wire into each role layout**

For each of `app/customer/layout.tsx`, `app/employee/layout.tsx`, `app/admin/orgs/[orgId]/layout.tsx`:

Add imports:

```tsx
import { RealtimeProvider } from "@/components/app/realtime-provider";
import { RealtimeRefresh } from "@/components/app/realtime-refresh";
```

Wrap the existing `<main>` in `<RealtimeProvider>`. Add `<RealtimeRefresh />` inside. Example for customer:

```tsx
return (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
    <header>...</header>
    <RealtimeProvider>
      <RealtimeRefresh />
      <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
    </RealtimeProvider>
  </div>
);
```

Match the exact structure already present — RealtimeProvider wraps the content area, RealtimeRefresh is a sibling of {children} so it stays mounted across navigations within the same layout.

- [ ] **Step 4: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add components/app/realtime-provider.tsx components/app/realtime-refresh.tsx app/customer/layout.tsx app/employee/layout.tsx "app/admin/orgs/[orgId]/layout.tsx"
git commit -m "feat(realtime): EventSource provider + RealtimeRefresh per role layout"
```

---

### Task 9: Playwright smoke for search + final verification

**Files:**
- Create: `tests/e2e/search.spec.ts`

Two scenarios in one spec: customer searches and finds a seeded task; admin searches and finds a seeded work request. The realtime path is harder to E2E-test deterministically and is verified manually in Task 10.

- [ ] **Step 1: search.spec.ts**

```ts
import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

test("admin searches and finds the seeded work request", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "admin@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/admin\/orgs\/[^/]+\/dashboard$/);

  // Type a search term that matches the seed's E2E request.
  await page.focus('input[aria-label="Search"]');
  await page.keyboard.type("E2E request");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/admin\/orgs\/[^/]+\/search\?q=/);
  await expect(page.getByText(/E2E request to accept/i)).toBeVisible();
});
```

NOTE: the customer doesn't have a relevant search target in the default seed (the seed creates one task and one request — both customer-visible in the org). Add another customer-search assertion later if needed; for 5c smoke this is enough.

- [ ] **Step 2: Run + commit**

```bash
# Kill any stale dev server on port 3000:
powershell.exe -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

pnpm test:e2e
```

Expected: 11 prior + 1 new = 12 passing + 1 skipped (R2-gated attachment test).

```bash
git add tests/e2e/search.spec.ts
git commit -m "test(e2e): admin search hits seeded work request"
```

---

### Task 10: Final verification + branch wrap

- [ ] **Step 1: Full gate sweep**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Expected counts:
- typecheck/lint/build clean
- vitest: 227 (222 prior + 5 from Task 2)
- E2E: 12 passing + 1 skipped

- [ ] **Step 2: Manual smoke for realtime**

`pnpm dev` (or `pnpm build && pnpm start`). Sign in as two different users in two browsers (e.g., employee in window A, admin in window B). Both visit the same task detail page. From window B, change the task status. Window A should auto-refresh and show the new status change in the activity feed within ~1 second. (If it doesn't, manually refresh window A to confirm the change persisted — that rules out a write-path bug and confirms it's purely a realtime delivery issue.)

If the realtime path doesn't fire:
- Check `docker exec marketing-crm-db psql -U crm -d crm -c "SELECT pg_listening_channels();"` — should return `crm_events` for the listening client. But this only works from within the same connection, so a more useful check: open a psql session and run `LISTEN crm_events;` then trigger an event from the app — psql should print `Asynchronous notification "crm_events" with payload "{...}" received...`.
- Check the SSE endpoint in DevTools Network tab — should show `text/event-stream` content type and stay pending.

- [ ] **Step 3: Hand off**

Branch `feat/phase-1-plan-5c-search-realtime` is ready for merge into `main`.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-05-16-ux-redesign-tasks-as-posts.md` — sub-plan 5c section):

- Postgres generated `tsvector` columns + GIN indexes on tasks, daily_updates, work_requests — Task 1 ✓
- `searchAll` service with role-scoped filtering + `ts_headline` snippets — Task 2 ✓
- Search server actions per role + per-role search page — Task 3 ✓
- Header search input + Cmd-K shortcut — Task 4 ✓
- SSE endpoint with LISTEN on a dedicated `pg.Client` — Task 6 ✓
- NOTIFY emitters wired into emit(), status change, time log, comment post, daily update create, attachment confirm — Task 7 ✓
- ActivityFeed and NotificationsBell live refresh via router.refresh — Task 8 ✓
- EventSource provider in role layouts with reconnect logic — Task 8 ✓
- Final verification — Tasks 9 + 10 ✓

**Out of scope (deliberately):**
- Comments are not searchable. Phase 2 can extend `searchAll` to include them once the tsvector concerns (which body column? do replies inherit their parent's context?) are decided.
- Realtime "presence" indicators ("X is typing", "Y is viewing") — not in Phase 1.
- Per-component event filtering (the `useRealtime` hook is general but only `RealtimeRefresh` consumes it for now). A future hook like `useRealtimeActivity(taskId)` could match Plan 5b's pattern of granular subscriptions.

**Placeholder scan:** No "TBD" / "TODO" / "Similar to Task N". Every code step has full code.

**Type consistency:**
- `SearchResult` discriminated union has three kinds: `task`, `update`, `work_request`. Each search page's `hrefFor` handles all three.
- `RealtimePayload` discriminated union has two kinds: `activity` (taskId + eventKind) and `notification` (userId). The SSE endpoint filters both, the client provider parses both opaquely.
- The `notify()` helper takes a `RealtimePayload` directly — type-checked at every call site.

**Architectural decisions baked in:**
- `tsvector` columns are GENERATED ALWAYS AS STORED — no triggers, no app-side maintenance.
- `plainto_tsquery` is used for user input — handles tokenization safely, no chance of malformed-query rejection.
- Snippets are post-processed on the React side via `renderSnippet` — `<mark>` tags become real React `<mark>` elements, rest is plain text. No `dangerouslySetInnerHTML`.
- LISTEN/NOTIFY broadcasts to ALL listeners; server-side filtering in the SSE handler keeps the wire traffic minimal.
- Vercel reconnect: hardcoded 280s timeout in the route + 1-second retry hint to the client. End-user sees seamless connectivity.
- Coarse-grained refresh: any matching event triggers `router.refresh()` on the whole layout. Sufficient for Phase 1's data volume; a future Phase 2 can shard subscriptions per-component.
- `notify()` failures NEVER block the originating action — every call is wrapped in try/catch.
- Production deployment on Neon: Neon HTTP doesn't support LISTEN. The deployment will need the `DATABASE_URL` (for migrations and now SSE) to be a plain `postgres://` connection, not the Neon-specific HTTP URL. This is a Plan 6 (deploy) concern; not in scope here.
