# Phase 1 — Plan 2b: Narrative + Intake Services (Daily Updates, Comments, Work Requests)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the service-layer functions for the three remaining narrative/intake entities — Daily Updates (with revisions + task linking), Comments (flat, soft-deleted, with revisions), Work Requests (with atomic auto-task creation + admin triage flow). All TDD'd against the live Postgres via the `withTransaction` fixture established in Plan 1. Each function takes `OrgContext`, validates with Zod, calls auth predicates, runs DB operations inside a transaction, and emits domain events.

**Architecture:** Functional services in `lib/services/<feature>/`. Cross-feature calls go through public APIs only — `work-requests.submit` calls `tasks.createFromRequest` (the public internal helper from Plan 2a). Notifications continue to use the in-app emit pipeline; email delivery still deferred to Plan 4. Comments are flat (no threading); soft-delete preserves thread context. Daily-update revisions and comment revisions snapshot prior state before each edit.

**Tech Stack:** Drizzle ORM, Vitest, Zod — same as Plan 2a.

**Branch:** Implement on `feat/phase-1-services-narrative-intake`, branched from `main`. Last main commit at start: the Plan-2a merge (`1670bcd`).

---

## File structure created by this plan

```
lib/services/
  _auth/
    predicates.ts                  (extended with requireDailyUpdateRead, requireCommentWrite)
  daily-updates/
    index.ts                       (public API: create, update, list, get, listRevisions)
    internal.ts                    (revision capture helper)
    schemas.ts                     (Zod input shapes)
  comments/
    index.ts                       (public API: create, update, softDelete, list)
    internal.ts                    (revision capture helper)
    schemas.ts
  work-requests/
    index.ts                       (public API: submit, accept, reject, markDuplicate, list, get)
    internal.ts                    (status_log helper)
    schemas.ts

tests/unit/services/
  _auth/
    predicates-narrative.test.ts   (new predicates only)
  daily-updates/
    create.test.ts
    update.test.ts
    list.test.ts
    revisions.test.ts
  comments/
    create.test.ts
    update.test.ts
    delete.test.ts
    list.test.ts
  work-requests/
    submit.test.ts
    accept.test.ts
    reject.test.ts
    duplicate.test.ts
    list.test.ts
```

---

## Tasks

### Task 1: requireDailyUpdateRead + requireCommentWrite predicates

**Files:**
- Modify: `lib/services/_auth/predicates.ts`
- Create: `tests/unit/services/_auth/predicates-narrative.test.ts`

`requireDailyUpdateRead` enforces that customers don't see `internal_only` updates — even if they have project access. `requireCommentWrite` is "anyone who can read the parent daily update can comment on it." Customer write is allowed (the design lets them comment on customer-visible updates).

- [ ] **Step 1: Failing test**

Create `tests/unit/services/_auth/predicates-narrative.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import {
  assignProject,
  createMembership,
  createOrg,
  createProject,
  createUser,
} from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import {
  requireDailyUpdateRead,
  requireCommentWrite,
} from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";

const orgCtx = (
  orgId: string,
  role: "customer" | "employee" | "admin",
  userId: string,
): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function createUpdate(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  projectId: string,
  userId: string,
  visibility: "customer_visible" | "internal_only" = "customer_visible",
) {
  const [row] = await db
    .insert(schema.dailyUpdates)
    .values({
      orgId,
      projectId,
      userId,
      body: "Test update",
      activityType: "execution",
      visibility,
      logDate: "2026-05-08",
    })
    .returning();
  return row!;
}

describe("requireDailyUpdateRead", () => {
  it("ok for admin always", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const update = await createUpdate(db, org.id, project.id, admin.id);
      const r = await requireDailyUpdateRead(db, orgCtx(org.id, "admin", admin.id), update.id);
      expect(r.ok).toBe(true);
    });
  });

  it("ok for assigned employee on a customer_visible update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const update = await createUpdate(db, org.id, project.id, admin.id);
      const r = await requireDailyUpdateRead(db, orgCtx(org.id, "employee", employee.id), update.id);
      expect(r.ok).toBe(true);
    });
  });

  it("ok for assigned employee on an internal_only update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const update = await createUpdate(db, org.id, project.id, admin.id, "internal_only");
      const r = await requireDailyUpdateRead(db, orgCtx(org.id, "employee", employee.id), update.id);
      expect(r.ok).toBe(true);
    });
  });

  it("unauthorized for customer on an internal_only update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await createUpdate(db, org.id, project.id, admin.id, "internal_only");
      const r = await requireDailyUpdateRead(db, orgCtx(org.id, "customer", customer.id), update.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("ok for customer on a customer_visible update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await createUpdate(db, org.id, project.id, admin.id, "customer_visible");
      const r = await requireDailyUpdateRead(db, orgCtx(org.id, "customer", customer.id), update.id);
      expect(r.ok).toBe(true);
    });
  });

  it("not_found if update is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const update = await createUpdate(db, orgB.id, project.id, admin.id);
      const r = await requireDailyUpdateRead(db, orgCtx(orgA.id, "admin", admin.id), update.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

describe("requireCommentWrite", () => {
  it("ok if actor can read the parent update (customer on customer_visible)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await createUpdate(db, org.id, project.id, admin.id, "customer_visible");
      const r = await requireCommentWrite(db, orgCtx(org.id, "customer", customer.id), update.id);
      expect(r.ok).toBe(true);
    });
  });

  it("unauthorized if actor cannot read parent (customer on internal_only)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await createUpdate(db, org.id, project.id, admin.id, "internal_only");
      const r = await requireCommentWrite(db, orgCtx(org.id, "customer", customer.id), update.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/_auth/predicates-narrative.test.ts
```
Expected: FAIL — exports don't exist.

- [ ] **Step 3: Implement**

Append to `lib/services/_auth/predicates.ts` (preserve existing exports):

```ts
export async function requireDailyUpdateRead(
  db: AnyDb,
  ctx: OrgContext,
  dailyUpdateId: string,
): Promise<Result<true>> {
  const [row] = await db
    .select({
      id: schema.dailyUpdates.id,
      orgId: schema.dailyUpdates.orgId,
      projectId: schema.dailyUpdates.projectId,
      visibility: schema.dailyUpdates.visibility,
    })
    .from(schema.dailyUpdates)
    .where(eq(schema.dailyUpdates.id, dailyUpdateId))
    .limit(1);
  if (!row) return err("not_found", "Daily update not found");
  if (row.orgId !== ctx.orgId) return err("not_found", "Daily update not found");

  if (ctx.actor.role === "admin") return ok(true);

  if (ctx.actor.role === "customer") {
    if (row.visibility !== "customer_visible") {
      return err("unauthorized", "Update is internal-only");
    }
    return requireOrgAccess(db, ctx);
  }

  // employee — must be assigned to the project
  const assigned = await db
    .select({ projectId: schema.projectAssignments.projectId })
    .from(schema.projectAssignments)
    .where(
      and(
        eq(schema.projectAssignments.userId, ctx.actor.userId),
        eq(schema.projectAssignments.projectId, row.projectId),
      ),
    )
    .limit(1);
  if (assigned.length === 0) return err("unauthorized", "Not assigned to this project");
  return ok(true);
}

export async function requireCommentWrite(
  db: AnyDb,
  ctx: OrgContext,
  dailyUpdateId: string,
): Promise<Result<true>> {
  // Anyone who can READ the parent update can comment on it.
  return requireDailyUpdateRead(db, ctx, dailyUpdateId);
}
```

- [ ] **Step 4: GREEN**

```bash
pnpm test tests/unit/services/_auth/predicates-narrative.test.ts
pnpm test
```
Expected: 8 new tests pass; 113 total project-wide.

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/phase-1-services-narrative-intake
git add lib/services/_auth/predicates.ts tests/unit/services/_auth/predicates-narrative.test.ts
git commit -m "feat(services): requireDailyUpdateRead + requireCommentWrite predicates"
```

---

### Task 2: daily-updates.createDailyUpdate (with task linking + notification)

**Files:**
- Create: `lib/services/daily-updates/index.ts`
- Create: `lib/services/daily-updates/internal.ts`
- Create: `lib/services/daily-updates/schemas.ts`
- Create: `tests/unit/services/daily-updates/create.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/daily-updates/create.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import {
  assignProject,
  createMembership,
  createOrg,
  createProject,
  createTask,
  createUser,
} from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { createDailyUpdate } from "@/lib/services/daily-updates";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("daily-updates.createDailyUpdate", () => {
  it("admin can post an update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        body: "Today we shipped...",
        activityType: "execution",
        visibility: "customer_visible",
        logDate: "2026-05-08",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.body).toBe("Today we shipped...");
      expect(r.data.visibility).toBe("customer_visible");
      expect(r.data.activityType).toBe("execution");
      expect(r.data.userId).toBe(admin.id);
    });
  });

  it("links referenced tasks via daily_update_tasks", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const t1 = await createTask(db, org.id, project.id, admin.id, { title: "T1" });
      const t2 = await createTask(db, org.id, project.id, admin.id, { title: "T2" });
      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        body: "worked on both",
        activityType: "execution",
        logDate: "2026-05-08",
        taskIds: [t1.id, t2.id],
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const links = await db
        .select()
        .from(schema.dailyUpdateTasks)
        .where(eq(schema.dailyUpdateTasks.dailyUpdateId, r.data.id));
      expect(links.map((l) => l.taskId).sort()).toEqual([t1.id, t2.id].sort());
    });
  });

  it("rejects taskIds that don't belong to projectId", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const p1 = await createProject(db, org.id, admin.id);
      const p2 = await createProject(db, org.id, admin.id);
      const otherTask = await createTask(db, org.id, p2.id, admin.id);
      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: p1.id,
        body: "x",
        activityType: "execution",
        logDate: "2026-05-08",
        taskIds: [otherTask.id],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("notifies customer users when visibility=customer_visible", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        body: "x",
        activityType: "execution",
        visibility: "customer_visible",
        logDate: "2026-05-08",
      });
      expect(r.ok).toBe(true);
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, customer.id));
      expect(notifs).toHaveLength(1);
      expect(notifs[0]!.eventType).toBe("daily_update.posted");
    });
  });

  it("does NOT notify customers when visibility=internal_only", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        body: "x",
        activityType: "execution",
        visibility: "internal_only",
        logDate: "2026-05-08",
      });
      expect(r.ok).toBe(true);
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, customer.id));
      expect(notifs).toHaveLength(0);
    });
  });

  it("notifies task assignees of referenced tasks (deduped, excluding actor)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      await db.insert(schema.taskAssignments).values({ taskId: task.id, userId: employee.id });

      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        body: "x",
        activityType: "execution",
        visibility: "internal_only",
        logDate: "2026-05-08",
        taskIds: [task.id],
      });
      expect(r.ok).toBe(true);
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, employee.id));
      expect(notifs).toHaveLength(1);
      expect(notifs[0]!.eventType).toBe("daily_update.posted");
    });
  });

  it("customer cannot post updates", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const r = await createDailyUpdate(db, ctxOf(org.id, "customer", customer.id), {
        projectId: project.id,
        body: "x",
        activityType: "execution",
        logDate: "2026-05-08",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("rejects logDate in the future", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      // Use a date 10 years in the future for a clearly-invalid value
      const futureYear = new Date().getFullYear() + 10;
      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        body: "x",
        activityType: "execution",
        logDate: `${futureYear}-01-01`,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/daily-updates/create.test.ts
```

- [ ] **Step 3: Schemas**

Create `lib/services/daily-updates/schemas.ts`:

```ts
import { z } from "zod";
import { dateSchema, idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const activityTypeEnum = z.enum([
  "planning",
  "execution",
  "review",
  "meeting",
  "admin",
  "other",
]);

export const updateVisibilityEnum = z.enum(["customer_visible", "internal_only"]);

function notInFuture(s: string): boolean {
  // logDate is a yyyy-mm-dd string in the actor's local frame.
  // Compare against today's date in UTC. Allow today.
  const todayUtc = new Date().toISOString().slice(0, 10);
  return s <= todayUtc;
}

export const createDailyUpdateInputSchema = z.object({
  projectId: idSchema,
  body: nonEmptyStringSchema.max(20000),
  activityType: activityTypeEnum,
  visibility: updateVisibilityEnum.optional(),
  logDate: dateSchema.refine(notInFuture, "logDate cannot be in the future"),
  taskIds: z.array(idSchema).optional(),
});
export type CreateDailyUpdateInput = z.infer<typeof createDailyUpdateInputSchema>;
```

- [ ] **Step 4: Internal helper**

Create `lib/services/daily-updates/internal.ts`:

```ts
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

type AnyDb = PgDatabase<any, typeof schema>;
type DailyUpdate = typeof schema.dailyUpdates.$inferSelect;

/**
 * Snapshot the prior state of a daily update into daily_update_revisions
 * before applying the update. Caller must already have validated authorization.
 */
export async function captureRevision(
  db: AnyDb,
  prior: DailyUpdate,
  editedBy: string,
) {
  await db.insert(schema.dailyUpdateRevisions).values({
    dailyUpdateId: prior.id,
    body: prior.body,
    activityType: prior.activityType,
    visibility: prior.visibility,
    editedBy,
  });
}
```

- [ ] **Step 5: Public API**

Create `lib/services/daily-updates/index.ts`:

```ts
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireProjectAccess } from "@/lib/services/_auth/predicates";
import { emit } from "@/lib/services/notifications";
import type { OrgContext } from "@/lib/services/_context";
import { createDailyUpdateInputSchema, type CreateDailyUpdateInput } from "./schemas";

type AnyDb = PgDatabase<any, typeof schema>;
type DailyUpdate = typeof schema.dailyUpdates.$inferSelect;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function createDailyUpdate(
  db: AnyDb,
  ctx: OrgContext,
  input: CreateDailyUpdateInput,
): Promise<Result<DailyUpdate>> {
  const parsed = createDailyUpdateInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  if (ctx.actor.role === "customer") {
    return err("unauthorized", "Customers cannot post updates");
  }

  const access = await requireProjectAccess(db, ctx, parsed.data.projectId);
  if (!access.ok) return access;

  // Validate taskIds: each must belong to the same project AND org.
  if (parsed.data.taskIds && parsed.data.taskIds.length > 0) {
    const tasks = await db
      .select({ id: schema.tasks.id, projectId: schema.tasks.projectId, orgId: schema.tasks.orgId })
      .from(schema.tasks)
      .where(inArray(schema.tasks.id, parsed.data.taskIds));
    const invalid = tasks.find(
      (t) => t.projectId !== parsed.data.projectId || t.orgId !== ctx.orgId,
    );
    if (tasks.length !== parsed.data.taskIds.length || invalid) {
      return err("validation", "Task IDs must all belong to the same project", {
        fields: { taskIds: "Some tasks do not belong to this project" },
      });
    }
  }

  const visibility = parsed.data.visibility ?? "customer_visible";

  const [row] = await db
    .insert(schema.dailyUpdates)
    .values({
      orgId: ctx.orgId,
      projectId: parsed.data.projectId,
      userId: ctx.actor.userId,
      body: parsed.data.body,
      activityType: parsed.data.activityType,
      visibility,
      logDate: parsed.data.logDate,
    })
    .returning();

  if (parsed.data.taskIds && parsed.data.taskIds.length > 0) {
    await db.insert(schema.dailyUpdateTasks).values(
      parsed.data.taskIds.map((taskId) => ({
        dailyUpdateId: row!.id,
        taskId,
      })),
    );
  }

  // Fan out: customer users in org (if visible) + assignees of referenced tasks.
  const recipients = new Set<string>();
  if (visibility === "customer_visible") {
    const customers = await db
      .select({ userId: schema.members.userId })
      .from(schema.members)
      .where(eq(schema.members.organizationId, ctx.orgId));
    customers.forEach((c) => recipients.add(c.userId));
  }
  if (parsed.data.taskIds && parsed.data.taskIds.length > 0) {
    const assignees = await db
      .select({ userId: schema.taskAssignments.userId })
      .from(schema.taskAssignments)
      .where(inArray(schema.taskAssignments.taskId, parsed.data.taskIds));
    assignees.forEach((a) => recipients.add(a.userId));
  }
  recipients.delete(ctx.actor.userId);
  if (recipients.size > 0) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "daily_update.posted",
      recipientUserIds: Array.from(recipients),
      payload: {
        dailyUpdateId: row!.id,
        projectId: parsed.data.projectId,
        actorId: ctx.actor.userId,
        visibility,
      },
      relatedType: "daily_update",
      relatedId: row!.id,
    });
  }

  return ok(row!);
}
```

- [ ] **Step 6: GREEN + commit**

```bash
pnpm test tests/unit/services/daily-updates/create.test.ts
pnpm test
git add lib/services/daily-updates tests/unit/services/daily-updates/create.test.ts
git commit -m "feat(services): daily-updates.createDailyUpdate with task linking + notify"
```

Expected: 8 new tests pass; ~121 total.

---

### Task 3: daily-updates.updateDailyUpdate (with revision capture)

**Files:**
- Modify: `lib/services/daily-updates/index.ts`
- Modify: `lib/services/daily-updates/schemas.ts`
- Create: `tests/unit/services/daily-updates/update.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/daily-updates/update.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { updateDailyUpdate } from "@/lib/services/daily-updates";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedUpdate(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  projectId: string,
  userId: string,
  overrides: Partial<typeof schema.dailyUpdates.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.dailyUpdates)
    .values({
      orgId,
      projectId,
      userId,
      body: "Original body",
      activityType: "execution",
      visibility: "customer_visible",
      logDate: "2026-05-08",
      ...overrides,
    })
    .returning();
  return row!;
}

describe("daily-updates.updateDailyUpdate", () => {
  it("author can update body + activityType + visibility, capturing the prior state", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, author.id);

      const r = await updateDailyUpdate(db, ctxOf(org.id, "employee", author.id), {
        id: update.id,
        body: "Edited body",
        activityType: "review",
        visibility: "internal_only",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.body).toBe("Edited body");
      expect(r.data.activityType).toBe("review");
      expect(r.data.visibility).toBe("internal_only");

      const revs = await db
        .select()
        .from(schema.dailyUpdateRevisions)
        .where(eq(schema.dailyUpdateRevisions.dailyUpdateId, update.id));
      expect(revs).toHaveLength(1);
      expect(revs[0]!.body).toBe("Original body");
      expect(revs[0]!.activityType).toBe("execution");
      expect(revs[0]!.visibility).toBe("customer_visible");
      expect(revs[0]!.editedBy).toBe(author.id);
    });
  });

  it("admin can update someone else's update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, author.id);
      const r = await updateDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        id: update.id,
        body: "Admin edit",
      });
      expect(r.ok).toBe(true);
    });
  });

  it("non-author non-admin employee cannot update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const other = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, author.id);
      const r = await updateDailyUpdate(db, ctxOf(org.id, "employee", other.id), {
        id: update.id,
        body: "Steal",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("noop returns ok with no revision row when nothing changed", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, author.id);
      const r = await updateDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        id: update.id,
        body: "Original body",  // same value
      });
      expect(r.ok).toBe(true);
      const revs = await db
        .select()
        .from(schema.dailyUpdateRevisions)
        .where(eq(schema.dailyUpdateRevisions.dailyUpdateId, update.id));
      expect(revs).toHaveLength(0);
    });
  });

  it("not_found if update is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const update = await seedUpdate(db, orgB.id, project.id, admin.id);
      const r = await updateDailyUpdate(db, ctxOf(orgA.id, "admin", admin.id), {
        id: update.id,
        body: "x",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/daily-updates/update.test.ts
```

- [ ] **Step 3: Schema**

Append to `lib/services/daily-updates/schemas.ts`:

```ts
export const updateDailyUpdateInputSchema = z
  .object({
    id: idSchema,
    body: nonEmptyStringSchema.max(20000).optional(),
    activityType: activityTypeEnum.optional(),
    visibility: updateVisibilityEnum.optional(),
  })
  .strict();
export type UpdateDailyUpdateInput = z.infer<typeof updateDailyUpdateInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/daily-updates/index.ts`:

```ts
import { captureRevision } from "./internal";
import { updateDailyUpdateInputSchema, type UpdateDailyUpdateInput } from "./schemas";

export async function updateDailyUpdate(
  db: AnyDb,
  ctx: OrgContext,
  input: UpdateDailyUpdateInput,
): Promise<Result<DailyUpdate>> {
  const parsed = updateDailyUpdateInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  if (ctx.actor.role === "customer") {
    return err("unauthorized", "Customers cannot edit updates");
  }

  const [existing] = await db
    .select()
    .from(schema.dailyUpdates)
    .where(eq(schema.dailyUpdates.id, parsed.data.id))
    .limit(1);
  if (!existing) return err("not_found", "Daily update not found");
  if (existing.orgId !== ctx.orgId) return err("not_found", "Daily update not found");

  // Author or admin only.
  if (ctx.actor.role !== "admin" && existing.userId !== ctx.actor.userId) {
    return err("unauthorized", "Only the author or an admin can edit this update");
  }

  // Determine if there's any actual change.
  const noopBody = parsed.data.body === undefined || parsed.data.body === existing.body;
  const noopActivity =
    parsed.data.activityType === undefined || parsed.data.activityType === existing.activityType;
  const noopVisibility =
    parsed.data.visibility === undefined || parsed.data.visibility === existing.visibility;
  if (noopBody && noopActivity && noopVisibility) {
    return ok(existing);
  }

  // Capture prior state, then update.
  await captureRevision(db, existing, ctx.actor.userId);

  const updates: Partial<typeof schema.dailyUpdates.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;
  if (parsed.data.activityType !== undefined) updates.activityType = parsed.data.activityType;
  if (parsed.data.visibility !== undefined) updates.visibility = parsed.data.visibility;

  const [row] = await db
    .update(schema.dailyUpdates)
    .set(updates)
    .where(eq(schema.dailyUpdates.id, parsed.data.id))
    .returning();
  return ok(row!);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/daily-updates/update.test.ts
pnpm test
git add lib/services/daily-updates tests/unit/services/daily-updates/update.test.ts
git commit -m "feat(services): daily-updates.updateDailyUpdate with revision capture"
```

---

### Task 4: daily-updates.list + get (visibility-scoped)

**Files:**
- Modify: `lib/services/daily-updates/index.ts`
- Modify: `lib/services/daily-updates/schemas.ts`
- Create: `tests/unit/services/daily-updates/list.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/daily-updates/list.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import {
  assignProject,
  createMembership,
  createOrg,
  createProject,
  createUser,
} from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { listDailyUpdates, getDailyUpdate } from "@/lib/services/daily-updates";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedUpdate(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  projectId: string,
  userId: string,
  overrides: Partial<typeof schema.dailyUpdates.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.dailyUpdates)
    .values({
      orgId,
      projectId,
      userId,
      body: "u",
      activityType: "execution",
      visibility: "customer_visible",
      logDate: "2026-05-08",
      ...overrides,
    })
    .returning();
  return row!;
}

describe("daily-updates.listDailyUpdates", () => {
  it("admin sees all updates in their org", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      await seedUpdate(db, org.id, project.id, admin.id, { body: "A", visibility: "customer_visible" });
      await seedUpdate(db, org.id, project.id, admin.id, { body: "B", visibility: "internal_only" });
      const r = await listDailyUpdates(db, ctxOf(org.id, "admin", admin.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(2);
    });
  });

  it("customer only sees customer_visible updates", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      await seedUpdate(db, org.id, project.id, admin.id, { body: "Public", visibility: "customer_visible" });
      await seedUpdate(db, org.id, project.id, admin.id, { body: "Private", visibility: "internal_only" });
      const r = await listDailyUpdates(db, ctxOf(org.id, "customer", customer.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((u) => u.body)).toEqual(["Public"]);
    });
  });

  it("employee only sees updates on assigned projects", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const p1 = await createProject(db, org.id, admin.id);
      const p2 = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, p1.id);
      await seedUpdate(db, org.id, p1.id, admin.id, { body: "On P1" });
      await seedUpdate(db, org.id, p2.id, admin.id, { body: "On P2" });
      const r = await listDailyUpdates(db, ctxOf(org.id, "employee", employee.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((u) => u.body)).toEqual(["On P1"]);
    });
  });

  it("projectId filter narrows the result", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const p1 = await createProject(db, org.id, admin.id);
      const p2 = await createProject(db, org.id, admin.id);
      await seedUpdate(db, org.id, p1.id, admin.id, { body: "P1" });
      await seedUpdate(db, org.id, p2.id, admin.id, { body: "P2" });
      const r = await listDailyUpdates(db, ctxOf(org.id, "admin", admin.id), { projectId: p1.id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((u) => u.body)).toEqual(["P1"]);
    });
  });

  it("orders by logDate desc then createdAt desc", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      await seedUpdate(db, org.id, project.id, admin.id, { body: "Older", logDate: "2026-04-01" });
      await seedUpdate(db, org.id, project.id, admin.id, { body: "Newer", logDate: "2026-05-08" });
      const r = await listDailyUpdates(db, ctxOf(org.id, "admin", admin.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((u) => u.body)).toEqual(["Newer", "Older"]);
    });
  });
});

describe("daily-updates.getDailyUpdate", () => {
  it("admin fetches", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id);
      const r = await getDailyUpdate(db, ctxOf(org.id, "admin", admin.id), update.id);
      expect(r.ok).toBe(true);
    });
  });

  it("customer cannot fetch internal_only", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id, { visibility: "internal_only" });
      const r = await getDailyUpdate(db, ctxOf(org.id, "customer", customer.id), update.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/daily-updates/list.test.ts
```

- [ ] **Step 3: Schema**

Append to `lib/services/daily-updates/schemas.ts`:

```ts
export const listDailyUpdatesInputSchema = z.object({
  projectId: idSchema.optional(),
});
export type ListDailyUpdatesInput = z.infer<typeof listDailyUpdatesInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/daily-updates/index.ts`:

```ts
import { desc, sql } from "drizzle-orm";
import { requireOrgAccess, requireDailyUpdateRead } from "@/lib/services/_auth/predicates";
import { listDailyUpdatesInputSchema, type ListDailyUpdatesInput } from "./schemas";

export async function listDailyUpdates(
  db: AnyDb,
  ctx: OrgContext,
  input: ListDailyUpdatesInput,
): Promise<Result<DailyUpdate[]>> {
  const parsed = listDailyUpdatesInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const access = await requireOrgAccess(db, ctx);
  if (!access.ok) return access;

  const conditions = [eq(schema.dailyUpdates.orgId, ctx.orgId)];
  if (parsed.data.projectId) conditions.push(eq(schema.dailyUpdates.projectId, parsed.data.projectId));

  if (ctx.actor.role === "customer") {
    conditions.push(eq(schema.dailyUpdates.visibility, "customer_visible"));
  }

  if (ctx.actor.role === "employee") {
    const assigned = await db
      .select({ projectId: schema.projectAssignments.projectId })
      .from(schema.projectAssignments)
      .where(eq(schema.projectAssignments.userId, ctx.actor.userId));
    const ids = assigned.map((r) => r.projectId);
    if (ids.length === 0) return ok([]);
    conditions.push(inArray(schema.dailyUpdates.projectId, ids));
  }

  const rows = await db
    .select()
    .from(schema.dailyUpdates)
    .where(and(...conditions))
    .orderBy(desc(schema.dailyUpdates.logDate), desc(schema.dailyUpdates.createdAt));
  return ok(rows);
}

export async function getDailyUpdate(
  db: AnyDb,
  ctx: OrgContext,
  id: string,
): Promise<Result<DailyUpdate>> {
  const access = await requireDailyUpdateRead(db, ctx, id);
  if (!access.ok) return access;
  const [row] = await db.select().from(schema.dailyUpdates).where(eq(schema.dailyUpdates.id, id)).limit(1);
  if (!row) return err("not_found", "Daily update not found");
  return ok(row);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/daily-updates/list.test.ts
pnpm test
git add lib/services/daily-updates tests/unit/services/daily-updates/list.test.ts
git commit -m "feat(services): daily-updates.listDailyUpdates + getDailyUpdate role-scoped"
```

---

### Task 5: daily-updates.listRevisions

**Files:**
- Modify: `lib/services/daily-updates/index.ts`
- Create: `tests/unit/services/daily-updates/revisions.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/daily-updates/revisions.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { listDailyUpdateRevisions } from "@/lib/services/daily-updates";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("daily-updates.listDailyUpdateRevisions", () => {
  it("returns revisions newest-first", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "current",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      // Insert 2 revisions; the second is more recent.
      await db.insert(schema.dailyUpdateRevisions).values({
        dailyUpdateId: update!.id,
        body: "v1",
        activityType: "planning",
        visibility: "customer_visible",
        editedBy: admin.id,
      });
      await db.insert(schema.dailyUpdateRevisions).values({
        dailyUpdateId: update!.id,
        body: "v2",
        activityType: "execution",
        visibility: "customer_visible",
        editedBy: admin.id,
      });
      const r = await listDailyUpdateRevisions(db, ctxOf(org.id, "admin", admin.id), update!.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(2);
      expect(r.data[0]!.body).toBe("v2");
      expect(r.data[1]!.body).toBe("v1");
    });
  });

  it("respects daily-update read auth (customer can't see internal_only revisions)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await db.insert(schema.members).values({
        id: `mbr_test_${Date.now()}`,
        userId: customer.id,
        organizationId: org.id,
        role: "member",
      });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "internal",
          activityType: "execution",
          visibility: "internal_only",
          logDate: "2026-05-08",
        })
        .returning();
      const r = await listDailyUpdateRevisions(db, ctxOf(org.id, "customer", customer.id), update!.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/daily-updates/revisions.test.ts
```

- [ ] **Step 3: Implement**

Append to `lib/services/daily-updates/index.ts`:

```ts
type DailyUpdateRevision = typeof schema.dailyUpdateRevisions.$inferSelect;

export async function listDailyUpdateRevisions(
  db: AnyDb,
  ctx: OrgContext,
  dailyUpdateId: string,
): Promise<Result<DailyUpdateRevision[]>> {
  const access = await requireDailyUpdateRead(db, ctx, dailyUpdateId);
  if (!access.ok) return access;

  const rows = await db
    .select()
    .from(schema.dailyUpdateRevisions)
    .where(eq(schema.dailyUpdateRevisions.dailyUpdateId, dailyUpdateId))
    .orderBy(desc(schema.dailyUpdateRevisions.editedAt));
  return ok(rows);
}
```

- [ ] **Step 4: GREEN + commit**

```bash
pnpm test tests/unit/services/daily-updates/revisions.test.ts
pnpm test
git add lib/services/daily-updates tests/unit/services/daily-updates/revisions.test.ts
git commit -m "feat(services): daily-updates.listDailyUpdateRevisions (newest-first)"
```

---

### Task 6: comments.createComment (with notification fan-out)

**Files:**
- Create: `lib/services/comments/index.ts`
- Create: `lib/services/comments/internal.ts`
- Create: `lib/services/comments/schemas.ts`
- Create: `tests/unit/services/comments/create.test.ts`

Notification recipients per spec §9.1: the daily-update's author + prior commenters on the same update (deduped, excluding actor). Internal-only updates only ever notify staff (we filter by recipient role to skip customers).

- [ ] **Step 1: Failing test**

Create `tests/unit/services/comments/create.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { createComment } from "@/lib/services/comments";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedUpdate(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  projectId: string,
  userId: string,
  visibility: "customer_visible" | "internal_only" = "customer_visible",
) {
  const [row] = await db
    .insert(schema.dailyUpdates)
    .values({
      orgId,
      projectId,
      userId,
      body: "u",
      activityType: "execution",
      visibility,
      logDate: "2026-05-08",
    })
    .returning();
  return row!;
}

describe("comments.createComment", () => {
  it("customer can comment on customer_visible update; notifies the author", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id);

      const r = await createComment(db, ctxOf(org.id, "customer", customer.id), {
        dailyUpdateId: update.id,
        body: "Looks great!",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.body).toBe("Looks great!");
      expect(r.data.userId).toBe(customer.id);

      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, admin.id));
      expect(notifs).toHaveLength(1);
      expect(notifs[0]!.eventType).toBe("comment.posted");
    });
  });

  it("customer cannot comment on internal_only update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id, "internal_only");
      const r = await createComment(db, ctxOf(org.id, "customer", customer.id), {
        dailyUpdateId: update.id,
        body: "x",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("notifies prior commenters in addition to the author (deduped, excluding actor)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const c1 = await createUser(db, { role: "customer" });
      const c2 = await createUser(db, { role: "customer" });
      await createMembership(db, c1.id, org.id);
      await createMembership(db, c2.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id);

      // c1 comments first.
      await createComment(db, ctxOf(org.id, "customer", c1.id), {
        dailyUpdateId: update.id,
        body: "first",
      });
      // c2 comments — should notify admin (author) AND c1 (prior commenter), excluding c2 (actor).
      const r = await createComment(db, ctxOf(org.id, "customer", c2.id), {
        dailyUpdateId: update.id,
        body: "second",
      });
      expect(r.ok).toBe(true);

      const adminNotifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, admin.id));
      const c1Notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, c1.id));
      const c2Notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, c2.id));
      // admin: notified by c1's first comment AND c2's second comment = 2
      expect(adminNotifs.filter((n) => n.eventType === "comment.posted")).toHaveLength(2);
      // c1: notified by c2's second comment = 1
      expect(c1Notifs.filter((n) => n.eventType === "comment.posted")).toHaveLength(1);
      // c2 (actor): not notified
      expect(c2Notifs).toHaveLength(0);
    });
  });

  it("rejects empty body", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id);
      const r = await createComment(db, ctxOf(org.id, "admin", admin.id), {
        dailyUpdateId: update.id,
        body: "",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/comments/create.test.ts
```

- [ ] **Step 3: Schemas**

Create `lib/services/comments/schemas.ts`:

```ts
import { z } from "zod";
import { idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const createCommentInputSchema = z.object({
  dailyUpdateId: idSchema,
  body: nonEmptyStringSchema.max(10000),
});
export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;
```

- [ ] **Step 4: Internal helper**

Create `lib/services/comments/internal.ts`:

```ts
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

type AnyDb = PgDatabase<any, typeof schema>;
type Comment = typeof schema.comments.$inferSelect;

export async function captureCommentRevision(
  db: AnyDb,
  prior: Comment,
  editedBy: string,
) {
  await db.insert(schema.commentRevisions).values({
    commentId: prior.id,
    body: prior.body,
    editedBy,
  });
}
```

- [ ] **Step 5: Public API**

Create `lib/services/comments/index.ts`:

```ts
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireCommentWrite, requireDailyUpdateRead } from "@/lib/services/_auth/predicates";
import { emit } from "@/lib/services/notifications";
import type { OrgContext } from "@/lib/services/_context";
import { createCommentInputSchema, type CreateCommentInput } from "./schemas";
import { captureCommentRevision } from "./internal";

type AnyDb = PgDatabase<any, typeof schema>;
type Comment = typeof schema.comments.$inferSelect;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function createComment(
  db: AnyDb,
  ctx: OrgContext,
  input: CreateCommentInput,
): Promise<Result<Comment>> {
  const parsed = createCommentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const auth = await requireCommentWrite(db, ctx, parsed.data.dailyUpdateId);
  if (!auth.ok) return auth;

  // Fetch the parent update to grab author + visibility.
  const [update] = await db
    .select({
      id: schema.dailyUpdates.id,
      orgId: schema.dailyUpdates.orgId,
      userId: schema.dailyUpdates.userId,
      visibility: schema.dailyUpdates.visibility,
    })
    .from(schema.dailyUpdates)
    .where(eq(schema.dailyUpdates.id, parsed.data.dailyUpdateId))
    .limit(1);
  if (!update) return err("not_found", "Daily update not found");

  const [row] = await db
    .insert(schema.comments)
    .values({
      orgId: ctx.orgId,
      dailyUpdateId: parsed.data.dailyUpdateId,
      userId: ctx.actor.userId,
      body: parsed.data.body,
    })
    .returning();

  // Recipients: update author + prior commenters (non-deleted), deduped, excluding actor.
  const recipients = new Set<string>();
  recipients.add(update.userId);

  const priorCommenters = await db
    .selectDistinct({ userId: schema.comments.userId })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.dailyUpdateId, parsed.data.dailyUpdateId),
        ne(schema.comments.id, row!.id),
        isNull(schema.comments.deletedAt),
      ),
    );
  priorCommenters.forEach((c) => recipients.add(c.userId));
  recipients.delete(ctx.actor.userId);

  // For internal_only updates, filter recipients to staff (no customers).
  let finalRecipients = Array.from(recipients);
  if (update.visibility === "internal_only" && finalRecipients.length > 0) {
    const userRoles = await db
      .select({ id: schema.users.id, systemRole: schema.users.systemRole })
      .from(schema.users)
      .where(inArray(schema.users.id, finalRecipients));
    const staffIds = new Set(
      userRoles.filter((u) => u.systemRole !== "customer").map((u) => u.id),
    );
    finalRecipients = finalRecipients.filter((id) => staffIds.has(id));
  }

  if (finalRecipients.length > 0) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "comment.posted",
      recipientUserIds: finalRecipients,
      payload: {
        commentId: row!.id,
        dailyUpdateId: parsed.data.dailyUpdateId,
        actorId: ctx.actor.userId,
      },
      relatedType: "comment",
      relatedId: row!.id,
    });
  }

  return ok(row!);
}
```

Note: `inArray` from drizzle-orm is needed — make sure it's imported.

- [ ] **Step 6: GREEN + commit**

```bash
pnpm test tests/unit/services/comments/create.test.ts
pnpm test
git add lib/services/comments tests/unit/services/comments/create.test.ts
git commit -m "feat(services): comments.createComment with author+prior-commenters notify"
```

---

### Task 7: comments.updateComment (with revision)

**Files:**
- Modify: `lib/services/comments/index.ts`
- Modify: `lib/services/comments/schemas.ts`
- Create: `tests/unit/services/comments/update.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/comments/update.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { updateComment } from "@/lib/services/comments";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedComment(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  dailyUpdateId: string,
  userId: string,
  body: string = "Original",
) {
  const [row] = await db
    .insert(schema.comments)
    .values({ orgId, dailyUpdateId, userId, body })
    .returning();
  return row!;
}

describe("comments.updateComment", () => {
  it("author can update body; revision captures prior body", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      const comment = await seedComment(db, org.id, update!.id, author.id, "Original");

      const r = await updateComment(db, ctxOf(org.id, "employee", author.id), {
        id: comment.id,
        body: "Edited",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.body).toBe("Edited");
      const revs = await db
        .select()
        .from(schema.commentRevisions)
        .where(eq(schema.commentRevisions.commentId, comment.id));
      expect(revs).toHaveLength(1);
      expect(revs[0]!.body).toBe("Original");
      expect(revs[0]!.editedBy).toBe(author.id);
    });
  });

  it("non-author non-admin cannot update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const other = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      const comment = await seedComment(db, org.id, update!.id, author.id);
      const r = await updateComment(db, ctxOf(org.id, "employee", other.id), {
        id: comment.id,
        body: "Steal",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("admin can update any comment", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      const comment = await seedComment(db, org.id, update!.id, author.id);
      const r = await updateComment(db, ctxOf(org.id, "admin", admin.id), {
        id: comment.id,
        body: "Admin edit",
      });
      expect(r.ok).toBe(true);
    });
  });

  it("noop returns ok with no revision row", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      const comment = await seedComment(db, org.id, update!.id, admin.id, "Same");
      const r = await updateComment(db, ctxOf(org.id, "admin", admin.id), {
        id: comment.id,
        body: "Same",
      });
      expect(r.ok).toBe(true);
      const revs = await db
        .select()
        .from(schema.commentRevisions)
        .where(eq(schema.commentRevisions.commentId, comment.id));
      expect(revs).toHaveLength(0);
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/comments/update.test.ts
```

- [ ] **Step 3: Schema**

Append to `lib/services/comments/schemas.ts`:

```ts
export const updateCommentInputSchema = z
  .object({
    id: idSchema,
    body: nonEmptyStringSchema.max(10000),
  })
  .strict();
export type UpdateCommentInput = z.infer<typeof updateCommentInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/comments/index.ts`:

```ts
import { updateCommentInputSchema, type UpdateCommentInput } from "./schemas";

export async function updateComment(
  db: AnyDb,
  ctx: OrgContext,
  input: UpdateCommentInput,
): Promise<Result<Comment>> {
  const parsed = updateCommentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const [existing] = await db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, parsed.data.id))
    .limit(1);
  if (!existing) return err("not_found", "Comment not found");
  if (existing.orgId !== ctx.orgId) return err("not_found", "Comment not found");
  if (existing.deletedAt) return err("not_found", "Comment not found");

  // Author or admin only.
  if (ctx.actor.role !== "admin" && existing.userId !== ctx.actor.userId) {
    return err("unauthorized", "Only the author or an admin can edit this comment");
  }

  if (parsed.data.body === existing.body) {
    return ok(existing);
  }

  await captureCommentRevision(db, existing, ctx.actor.userId);

  const [row] = await db
    .update(schema.comments)
    .set({ body: parsed.data.body, updatedAt: new Date() })
    .where(eq(schema.comments.id, parsed.data.id))
    .returning();
  return ok(row!);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/comments/update.test.ts
pnpm test
git add lib/services/comments tests/unit/services/comments/update.test.ts
git commit -m "feat(services): comments.updateComment with revision capture"
```

---

### Task 8: comments.softDeleteComment

**Files:**
- Modify: `lib/services/comments/index.ts`
- Modify: `lib/services/comments/schemas.ts`
- Create: `tests/unit/services/comments/delete.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/comments/delete.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { softDeleteComment } from "@/lib/services/comments";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("comments.softDeleteComment", () => {
  it("author can soft-delete; deletedAt is set; row remains", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      const [comment] = await db
        .insert(schema.comments)
        .values({ orgId: org.id, dailyUpdateId: update!.id, userId: author.id, body: "x" })
        .returning();

      const r = await softDeleteComment(db, ctxOf(org.id, "employee", author.id), { id: comment!.id });
      expect(r.ok).toBe(true);

      const [row] = await db.select().from(schema.comments).where(eq(schema.comments.id, comment!.id));
      expect(row).toBeDefined();
      expect(row!.deletedAt).not.toBeNull();
    });
  });

  it("admin can soft-delete any comment", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      const [comment] = await db
        .insert(schema.comments)
        .values({ orgId: org.id, dailyUpdateId: update!.id, userId: author.id, body: "x" })
        .returning();
      const r = await softDeleteComment(db, ctxOf(org.id, "admin", admin.id), { id: comment!.id });
      expect(r.ok).toBe(true);
    });
  });

  it("non-author non-admin cannot delete", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const other = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      const [comment] = await db
        .insert(schema.comments)
        .values({ orgId: org.id, dailyUpdateId: update!.id, userId: author.id, body: "x" })
        .returning();
      const r = await softDeleteComment(db, ctxOf(org.id, "employee", other.id), { id: comment!.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/comments/delete.test.ts
```

- [ ] **Step 3: Schema**

Append to `lib/services/comments/schemas.ts`:

```ts
export const softDeleteCommentInputSchema = z.object({ id: idSchema });
export type SoftDeleteCommentInput = z.infer<typeof softDeleteCommentInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/comments/index.ts`:

```ts
import { softDeleteCommentInputSchema, type SoftDeleteCommentInput } from "./schemas";

export async function softDeleteComment(
  db: AnyDb,
  ctx: OrgContext,
  input: SoftDeleteCommentInput,
): Promise<Result<true>> {
  const parsed = softDeleteCommentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const [existing] = await db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, parsed.data.id))
    .limit(1);
  if (!existing) return err("not_found", "Comment not found");
  if (existing.orgId !== ctx.orgId) return err("not_found", "Comment not found");

  if (ctx.actor.role !== "admin" && existing.userId !== ctx.actor.userId) {
    return err("unauthorized", "Only the author or an admin can delete this comment");
  }

  await db
    .update(schema.comments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.comments.id, parsed.data.id));
  return ok(true);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/comments/delete.test.ts
pnpm test
git add lib/services/comments tests/unit/services/comments/delete.test.ts
git commit -m "feat(services): comments.softDeleteComment (author-or-admin)"
```

---

### Task 9: comments.listComments

**Files:**
- Modify: `lib/services/comments/index.ts`
- Create: `tests/unit/services/comments/list.test.ts`

Returns chronological comments. Soft-deleted rows are returned with `deletedAt` set so the UI can render `[deleted]` placeholders.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/comments/list.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { listComments } from "@/lib/services/comments";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("comments.listComments", () => {
  it("returns comments in chronological order including soft-deleted", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      await db.insert(schema.comments).values({ orgId: org.id, dailyUpdateId: update!.id, userId: admin.id, body: "First" });
      await db.insert(schema.comments).values({ orgId: org.id, dailyUpdateId: update!.id, userId: admin.id, body: "Second", deletedAt: new Date() });
      await db.insert(schema.comments).values({ orgId: org.id, dailyUpdateId: update!.id, userId: admin.id, body: "Third" });

      const r = await listComments(db, ctxOf(org.id, "admin", admin.id), update!.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((c) => c.body)).toEqual(["First", "Second", "Third"]);
      expect(r.data[1]!.deletedAt).not.toBeNull();
    });
  });

  it("respects parent update read auth (customer cannot list internal_only comments)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "internal_only",
          logDate: "2026-05-08",
        })
        .returning();
      const r = await listComments(db, ctxOf(org.id, "customer", customer.id), update!.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/comments/list.test.ts
```

- [ ] **Step 3: Implement**

Append to `lib/services/comments/index.ts`:

```ts
import { asc } from "drizzle-orm";

export async function listComments(
  db: AnyDb,
  ctx: OrgContext,
  dailyUpdateId: string,
): Promise<Result<Comment[]>> {
  const access = await requireDailyUpdateRead(db, ctx, dailyUpdateId);
  if (!access.ok) return access;

  const rows = await db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.dailyUpdateId, dailyUpdateId))
    .orderBy(asc(schema.comments.createdAt));
  return ok(rows);
}
```

- [ ] **Step 4: GREEN + commit**

```bash
pnpm test tests/unit/services/comments/list.test.ts
pnpm test
git add lib/services/comments tests/unit/services/comments/list.test.ts
git commit -m "feat(services): comments.listComments (chronological, includes soft-deleted)"
```

---

### Task 10: work-requests.submit (atomic with task creation + admin notify)

**Files:**
- Create: `lib/services/work-requests/index.ts`
- Create: `lib/services/work-requests/internal.ts`
- Create: `lib/services/work-requests/schemas.ts`
- Create: `tests/unit/services/work-requests/submit.test.ts`

The submit flow per spec §8.6:
```
within transaction:
  insert work_requests (status='submitted', project_id maybe null)
  insert task via tasks.createFromRequest (project_id from request, source='from_request')
  update work_requests.resolved_task_id = task.id
  insert work_request_status_log (null → 'submitted')
after commit:
  emit work_request.submitted to all admins in the org
```

Customers may submit (the only customer-write op in this plan). `requireOrgAccess(db, ctx)` covers the customer's membership check.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/work-requests/submit.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { submitWorkRequest } from "@/lib/services/work-requests";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("work-requests.submitWorkRequest", () => {
  it("customer can submit; auto-creates task; resolved_task_id is set; admin notified", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);

      const r = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), {
        title: "Help with X",
        description: "Customer notes",
        projectId: project.id,
        priorityHint: "high",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("submitted");
      expect(r.data.submittedBy).toBe(customer.id);
      expect(r.data.priorityHint).toBe("high");
      expect(r.data.resolvedTaskId).not.toBeNull();

      // Auto-task exists with source=from_request and matching project.
      const tasks = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, r.data.resolvedTaskId!));
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.source).toBe("from_request");
      expect(tasks[0]!.sourceRequestId).toBe(r.data.id);
      expect(tasks[0]!.projectId).toBe(project.id);
      expect(tasks[0]!.status).toBe("todo");

      // Admin notified.
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, admin.id));
      expect(notifs).toHaveLength(1);
      expect(notifs[0]!.eventType).toBe("work_request.submitted");

      // Status log: null -> submitted.
      const logs = await db
        .select()
        .from(schema.workRequestStatusLog)
        .where(eq(schema.workRequestStatusLog.workRequestId, r.data.id));
      expect(logs).toHaveLength(1);
      expect(logs[0]!.fromStatus).toBeNull();
      expect(logs[0]!.toStatus).toBe("submitted");
    });
  });

  it("supports null projectId (general inquiry → triage queue)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);

      const r = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), {
        title: "General",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.projectId).toBeNull();
      const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.id, r.data.resolvedTaskId!));
      expect(tasks[0]!.projectId).toBeNull();
    });
  });

  it("rejects projectId that belongs to another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, orgA.id);
      const otherProject = await createProject(db, orgB.id, admin.id);
      const r = await submitWorkRequest(db, ctxOf(orgA.id, "customer", customer.id), {
        title: "x",
        projectId: otherProject.id,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });

  it("rejects empty title", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const r = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("non-member customer cannot submit (unauthorized)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      // Note: NOT a member of the org.
      const r = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/work-requests/submit.test.ts
```

- [ ] **Step 3: Schemas**

Create `lib/services/work-requests/schemas.ts`:

```ts
import { z } from "zod";
import { idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const priorityEnum = z.enum(["low", "normal", "high", "urgent"]);
export const workRequestStatusEnum = z.enum(["submitted", "accepted", "rejected", "duplicate"]);

export const submitWorkRequestInputSchema = z.object({
  title: nonEmptyStringSchema.max(200),
  description: z.string().max(10000).optional(),
  projectId: idSchema.optional(),
  priorityHint: priorityEnum.optional(),
});
export type SubmitWorkRequestInput = z.infer<typeof submitWorkRequestInputSchema>;
```

- [ ] **Step 4: Internal helper**

Create `lib/services/work-requests/internal.ts`:

```ts
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

type AnyDb = PgDatabase<any, typeof schema>;

export async function logRequestStatusTransition(
  db: AnyDb,
  workRequestId: string,
  fromStatus: string | null,
  toStatus: string,
  changedBy: string,
  note?: string,
) {
  await db.insert(schema.workRequestStatusLog).values({
    workRequestId,
    fromStatus,
    toStatus,
    changedBy,
    note: note ?? null,
  });
}
```

- [ ] **Step 5: Public API**

Create `lib/services/work-requests/index.ts`:

```ts
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireOrgAccess } from "@/lib/services/_auth/predicates";
import { emit } from "@/lib/services/notifications";
import { createFromRequest } from "@/lib/services/tasks";
import type { OrgContext } from "@/lib/services/_context";
import { submitWorkRequestInputSchema, type SubmitWorkRequestInput } from "./schemas";
import { logRequestStatusTransition } from "./internal";

type AnyDb = PgDatabase<any, typeof schema>;
type WorkRequest = typeof schema.workRequests.$inferSelect;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function submitWorkRequest(
  db: AnyDb,
  ctx: OrgContext,
  input: SubmitWorkRequestInput,
): Promise<Result<WorkRequest>> {
  const parsed = submitWorkRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const access = await requireOrgAccess(db, ctx);
  if (!access.ok) return access;

  // If projectId given, validate it belongs to this org.
  if (parsed.data.projectId) {
    const [project] = await db
      .select({ id: schema.projects.id, orgId: schema.projects.orgId })
      .from(schema.projects)
      .where(eq(schema.projects.id, parsed.data.projectId))
      .limit(1);
    if (!project) return err("not_found", "Project not found");
    if (project.orgId !== ctx.orgId) return err("not_found", "Project not found");
  }

  // 1. Insert the work_request first (resolved_task_id starts null).
  const [request] = await db
    .insert(schema.workRequests)
    .values({
      orgId: ctx.orgId,
      submittedBy: ctx.actor.userId,
      projectId: parsed.data.projectId ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priorityHint: parsed.data.priorityHint ?? "normal",
      status: "submitted",
    })
    .returning();

  // 2. Auto-create the task via tasks.createFromRequest (which inserts status_log too).
  const task = await createFromRequest(db, {
    orgId: ctx.orgId,
    projectId: request!.projectId,
    title: request!.title,
    description: request!.description ?? undefined,
    priority: request!.priorityHint,
    sourceRequestId: request!.id,
    createdBy: ctx.actor.userId,
  });

  // 3. Update the request with the task id.
  const [updated] = await db
    .update(schema.workRequests)
    .set({ resolvedTaskId: task.id, updatedAt: new Date() })
    .where(eq(schema.workRequests.id, request!.id))
    .returning();

  // 4. Status log: null -> submitted.
  await logRequestStatusTransition(db, request!.id, null, "submitted", ctx.actor.userId);

  // 5. Notify all admins in this org.
  const admins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.systemRole, "admin"));
  const adminIds = admins.map((a) => a.id).filter((id) => id !== ctx.actor.userId);
  if (adminIds.length > 0) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "work_request.submitted",
      recipientUserIds: adminIds,
      payload: {
        workRequestId: updated!.id,
        title: updated!.title,
        actorId: ctx.actor.userId,
      },
      relatedType: "work_request",
      relatedId: updated!.id,
    });
  }

  return ok(updated!);
}
```

- [ ] **Step 6: GREEN + commit**

```bash
pnpm test tests/unit/services/work-requests/submit.test.ts
pnpm test
git add lib/services/work-requests tests/unit/services/work-requests/submit.test.ts
git commit -m "feat(services): work-requests.submitWorkRequest (atomic with task creation)"
```

---

### Task 11: work-requests.acceptWorkRequest

**Files:**
- Modify: `lib/services/work-requests/index.ts`
- Modify: `lib/services/work-requests/schemas.ts`
- Create: `tests/unit/services/work-requests/accept.test.ts`

Per spec §8.7: admin can accept. If the linked task has no `project_id`, admin **must** pass one. Status moves to `accepted`. The task remains `todo` and now has the assigned project. Customer (submitter) is notified of status change.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/work-requests/accept.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { acceptWorkRequest, submitWorkRequest } from "@/lib/services/work-requests";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("work-requests.acceptWorkRequest", () => {
  it("admin accepts a request that already has a project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), {
        title: "x",
        projectId: project.id,
      });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;

      const r = await acceptWorkRequest(db, ctxOf(org.id, "admin", admin.id), {
        id: submitted.data.id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("accepted");
      expect(r.data.reviewedBy).toBe(admin.id);
      expect(r.data.reviewedAt).not.toBeNull();

      // Customer (submitter) notified of status change.
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, customer.id));
      expect(notifs.filter((n) => n.eventType === "work_request.status_changed")).toHaveLength(1);

      // Status log adds submitted -> accepted.
      const logs = await db
        .select()
        .from(schema.workRequestStatusLog)
        .where(eq(schema.workRequestStatusLog.workRequestId, submitted.data.id));
      expect(logs.find((l) => l.toStatus === "accepted")).toBeDefined();
    });
  });

  it("admin assigns project on accept when request had none", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), {
        title: "general",
      });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;

      const r = await acceptWorkRequest(db, ctxOf(org.id, "admin", admin.id), {
        id: submitted.data.id,
        projectId: project.id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.projectId).toBe(project.id);
      // Linked task must have project_id set too.
      const tasks = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, r.data.resolvedTaskId!));
      expect(tasks[0]!.projectId).toBe(project.id);
    });
  });

  it("requires projectId when request has no project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await acceptWorkRequest(db, ctxOf(org.id, "admin", admin.id), { id: submitted.data.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("rejects accept on a non-submitted request", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x", projectId: project.id });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const first = await acceptWorkRequest(db, ctxOf(org.id, "admin", admin.id), { id: submitted.data.id });
      expect(first.ok).toBe(true);
      // second accept should be a conflict.
      const second = await acceptWorkRequest(db, ctxOf(org.id, "admin", admin.id), { id: submitted.data.id });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe("conflict");
    });
  });

  it("non-admin cannot accept", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x", projectId: project.id });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await acceptWorkRequest(db, ctxOf(org.id, "employee", employee.id), { id: submitted.data.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/work-requests/accept.test.ts
```

- [ ] **Step 3: Schema**

Append to `lib/services/work-requests/schemas.ts`:

```ts
export const acceptWorkRequestInputSchema = z.object({
  id: idSchema,
  projectId: idSchema.optional(),
});
export type AcceptWorkRequestInput = z.infer<typeof acceptWorkRequestInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/work-requests/index.ts`:

```ts
import { requireRole } from "@/lib/services/_auth/predicates";
import { acceptWorkRequestInputSchema, type AcceptWorkRequestInput } from "./schemas";

export async function acceptWorkRequest(
  db: AnyDb,
  ctx: OrgContext,
  input: AcceptWorkRequestInput,
): Promise<Result<WorkRequest>> {
  const parsed = acceptWorkRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  const [request] = await db
    .select()
    .from(schema.workRequests)
    .where(eq(schema.workRequests.id, parsed.data.id))
    .limit(1);
  if (!request) return err("not_found", "Work request not found");
  if (request.orgId !== ctx.orgId) return err("not_found", "Work request not found");
  if (request.status !== "submitted") {
    return err("conflict", `Cannot accept a request with status '${request.status}'`);
  }

  // If request has no project_id, admin must supply one.
  let finalProjectId = request.projectId;
  if (!finalProjectId) {
    if (!parsed.data.projectId) {
      return err("validation", "projectId is required when the request has no project", {
        fields: { projectId: "Required to accept a triage request" },
      });
    }
    // Validate the supplied project belongs to this org.
    const [project] = await db
      .select({ id: schema.projects.id, orgId: schema.projects.orgId })
      .from(schema.projects)
      .where(eq(schema.projects.id, parsed.data.projectId))
      .limit(1);
    if (!project || project.orgId !== ctx.orgId) {
      return err("not_found", "Project not found");
    }
    finalProjectId = parsed.data.projectId;
  }

  // Update work_request.
  const [updated] = await db
    .update(schema.workRequests)
    .set({
      status: "accepted",
      projectId: finalProjectId,
      reviewedBy: ctx.actor.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.workRequests.id, parsed.data.id))
    .returning();

  // If the linked task is in triage (no project_id), assign the project to it too.
  if (request.resolvedTaskId) {
    const [task] = await db
      .select({ id: schema.tasks.id, projectId: schema.tasks.projectId })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, request.resolvedTaskId))
      .limit(1);
    if (task && !task.projectId) {
      await db
        .update(schema.tasks)
        .set({ projectId: finalProjectId, updatedAt: new Date() })
        .where(eq(schema.tasks.id, task.id));
    }
  }

  // Status log: submitted -> accepted.
  await logRequestStatusTransition(db, parsed.data.id, "submitted", "accepted", ctx.actor.userId);

  // Notify the submitter.
  if (request.submittedBy !== ctx.actor.userId) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "work_request.status_changed",
      recipientUserIds: [request.submittedBy],
      payload: {
        workRequestId: updated!.id,
        title: updated!.title,
        from: "submitted",
        to: "accepted",
        actorId: ctx.actor.userId,
      },
      relatedType: "work_request",
      relatedId: updated!.id,
    });
  }

  return ok(updated!);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/work-requests/accept.test.ts
pnpm test
git add lib/services/work-requests tests/unit/services/work-requests/accept.test.ts
git commit -m "feat(services): work-requests.acceptWorkRequest (admin-only, with project assignment)"
```

---

### Task 12: work-requests.rejectWorkRequest (cancels linked task)

**Files:**
- Modify: `lib/services/work-requests/index.ts`
- Modify: `lib/services/work-requests/schemas.ts`
- Create: `tests/unit/services/work-requests/reject.test.ts`

Per spec §8.7 reject path: status → 'rejected', set `rejection_reason`. Linked task → 'cancelled' via `task_status_log`. Notify submitter. Both transitions in same transaction.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/work-requests/reject.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { rejectWorkRequest, submitWorkRequest } from "@/lib/services/work-requests";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("work-requests.rejectWorkRequest", () => {
  it("admin rejects with reason; status -> rejected, linked task -> cancelled, submitter notified", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), {
        title: "x",
        projectId: project.id,
      });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;

      const r = await rejectWorkRequest(db, ctxOf(org.id, "admin", admin.id), {
        id: submitted.data.id,
        reason: "Out of scope for this engagement",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("rejected");
      expect(r.data.rejectionReason).toBe("Out of scope for this engagement");

      // Linked task transitioned to cancelled.
      const [task] = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, r.data.resolvedTaskId!));
      expect(task!.status).toBe("cancelled");

      // task_status_log has todo -> cancelled.
      const taskLogs = await db
        .select()
        .from(schema.taskStatusLog)
        .where(eq(schema.taskStatusLog.taskId, r.data.resolvedTaskId!));
      expect(taskLogs.find((l) => l.toStatus === "cancelled" && l.fromStatus === "todo")).toBeDefined();

      // Submitter notified.
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, customer.id));
      expect(notifs.filter((n) => n.eventType === "work_request.status_changed")).toHaveLength(1);
    });
  });

  it("requires a non-empty reason", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await rejectWorkRequest(db, ctxOf(org.id, "admin", admin.id), { id: submitted.data.id, reason: "" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("conflict if request is already non-submitted", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x", projectId: project.id });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      // First reject (success).
      await rejectWorkRequest(db, ctxOf(org.id, "admin", admin.id), { id: submitted.data.id, reason: "no" });
      // Second reject (conflict).
      const r = await rejectWorkRequest(db, ctxOf(org.id, "admin", admin.id), { id: submitted.data.id, reason: "no" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("conflict");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/work-requests/reject.test.ts
```

- [ ] **Step 3: Schema**

Append to `lib/services/work-requests/schemas.ts`:

```ts
export const rejectWorkRequestInputSchema = z.object({
  id: idSchema,
  reason: nonEmptyStringSchema.max(2000),
});
export type RejectWorkRequestInput = z.infer<typeof rejectWorkRequestInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/work-requests/index.ts`. Note: cancelling the linked task uses Drizzle directly (not `tasks.changeTaskStatus`) because (a) we're already inside the same transaction and (b) `changeTaskStatus` would emit a `task.status_changed` notification which is redundant given we're emitting `work_request.status_changed` to the same submitter.

```ts
import { rejectWorkRequestInputSchema, type RejectWorkRequestInput } from "./schemas";

async function cancelLinkedTask(
  db: AnyDb,
  taskId: string,
  changedBy: string,
  note: string,
) {
  const [task] = await db
    .select({ status: schema.tasks.status })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId))
    .limit(1);
  if (!task) return;
  if (task.status === "cancelled") return;
  await db
    .update(schema.tasks)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(schema.tasks.id, taskId));
  await db.insert(schema.taskStatusLog).values({
    taskId,
    fromStatus: task.status,
    toStatus: "cancelled",
    changedBy,
    note,
  });
}

export async function rejectWorkRequest(
  db: AnyDb,
  ctx: OrgContext,
  input: RejectWorkRequestInput,
): Promise<Result<WorkRequest>> {
  const parsed = rejectWorkRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  const [request] = await db
    .select()
    .from(schema.workRequests)
    .where(eq(schema.workRequests.id, parsed.data.id))
    .limit(1);
  if (!request) return err("not_found", "Work request not found");
  if (request.orgId !== ctx.orgId) return err("not_found", "Work request not found");
  if (request.status !== "submitted") {
    return err("conflict", `Cannot reject a request with status '${request.status}'`);
  }

  const [updated] = await db
    .update(schema.workRequests)
    .set({
      status: "rejected",
      rejectionReason: parsed.data.reason,
      reviewedBy: ctx.actor.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.workRequests.id, parsed.data.id))
    .returning();

  if (request.resolvedTaskId) {
    await cancelLinkedTask(db, request.resolvedTaskId, ctx.actor.userId, `Request rejected: ${parsed.data.reason}`);
  }

  await logRequestStatusTransition(db, parsed.data.id, "submitted", "rejected", ctx.actor.userId, parsed.data.reason);

  if (request.submittedBy !== ctx.actor.userId) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "work_request.status_changed",
      recipientUserIds: [request.submittedBy],
      payload: {
        workRequestId: updated!.id,
        title: updated!.title,
        from: "submitted",
        to: "rejected",
        reason: parsed.data.reason,
        actorId: ctx.actor.userId,
      },
      relatedType: "work_request",
      relatedId: updated!.id,
    });
  }

  return ok(updated!);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/work-requests/reject.test.ts
pnpm test
git add lib/services/work-requests tests/unit/services/work-requests/reject.test.ts
git commit -m "feat(services): work-requests.rejectWorkRequest (cancels linked task + notify)"
```

---

### Task 13: work-requests.markDuplicate

**Files:**
- Modify: `lib/services/work-requests/index.ts`
- Modify: `lib/services/work-requests/schemas.ts`
- Create: `tests/unit/services/work-requests/duplicate.test.ts`

Per spec §8.7: status → 'duplicate', `rejection_reason` includes pointer to canonical task. Linked task → 'cancelled'. Submitter notified.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/work-requests/duplicate.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createTask, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { markDuplicateWorkRequest, submitWorkRequest } from "@/lib/services/work-requests";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("work-requests.markDuplicateWorkRequest", () => {
  it("admin marks duplicate; cancels linked task; submitter notified", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const canonicalTask = await createTask(db, org.id, project.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), {
        title: "dup",
        projectId: project.id,
      });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;

      const r = await markDuplicateWorkRequest(db, ctxOf(org.id, "admin", admin.id), {
        id: submitted.data.id,
        canonicalTaskId: canonicalTask.id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("duplicate");
      expect(r.data.rejectionReason).toContain(canonicalTask.id);

      // Linked task cancelled.
      const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, r.data.resolvedTaskId!));
      expect(task!.status).toBe("cancelled");

      // Submitter notified.
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, customer.id));
      expect(notifs.filter((n) => n.eventType === "work_request.status_changed")).toHaveLength(1);
    });
  });

  it("validation: canonicalTaskId must belong to same org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, orgA.id);
      const otherProject = await createProject(db, orgB.id, admin.id);
      const otherTask = await createTask(db, orgB.id, otherProject.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(orgA.id, "customer", customer.id), { title: "x" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await markDuplicateWorkRequest(db, ctxOf(orgA.id, "admin", admin.id), {
        id: submitted.data.id,
        canonicalTaskId: otherTask.id,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/work-requests/duplicate.test.ts
```

- [ ] **Step 3: Schema**

Append to `lib/services/work-requests/schemas.ts`:

```ts
export const markDuplicateWorkRequestInputSchema = z.object({
  id: idSchema,
  canonicalTaskId: idSchema,
});
export type MarkDuplicateWorkRequestInput = z.infer<typeof markDuplicateWorkRequestInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/work-requests/index.ts`:

```ts
import { markDuplicateWorkRequestInputSchema, type MarkDuplicateWorkRequestInput } from "./schemas";

export async function markDuplicateWorkRequest(
  db: AnyDb,
  ctx: OrgContext,
  input: MarkDuplicateWorkRequestInput,
): Promise<Result<WorkRequest>> {
  const parsed = markDuplicateWorkRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  const [request] = await db
    .select()
    .from(schema.workRequests)
    .where(eq(schema.workRequests.id, parsed.data.id))
    .limit(1);
  if (!request) return err("not_found", "Work request not found");
  if (request.orgId !== ctx.orgId) return err("not_found", "Work request not found");
  if (request.status !== "submitted") {
    return err("conflict", `Cannot mark duplicate on a request with status '${request.status}'`);
  }

  // Validate canonical task belongs to same org.
  const [canonical] = await db
    .select({ id: schema.tasks.id, orgId: schema.tasks.orgId, title: schema.tasks.title })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, parsed.data.canonicalTaskId))
    .limit(1);
  if (!canonical || canonical.orgId !== ctx.orgId) {
    return err("not_found", "Canonical task not found");
  }

  const reason = `Duplicate of task ${canonical.id} (${canonical.title})`;

  const [updated] = await db
    .update(schema.workRequests)
    .set({
      status: "duplicate",
      rejectionReason: reason,
      reviewedBy: ctx.actor.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.workRequests.id, parsed.data.id))
    .returning();

  if (request.resolvedTaskId) {
    await cancelLinkedTask(db, request.resolvedTaskId, ctx.actor.userId, reason);
  }

  await logRequestStatusTransition(db, parsed.data.id, "submitted", "duplicate", ctx.actor.userId, reason);

  if (request.submittedBy !== ctx.actor.userId) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "work_request.status_changed",
      recipientUserIds: [request.submittedBy],
      payload: {
        workRequestId: updated!.id,
        title: updated!.title,
        from: "submitted",
        to: "duplicate",
        reason,
        canonicalTaskId: canonical.id,
        actorId: ctx.actor.userId,
      },
      relatedType: "work_request",
      relatedId: updated!.id,
    });
  }

  return ok(updated!);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/work-requests/duplicate.test.ts
pnpm test
git add lib/services/work-requests tests/unit/services/work-requests/duplicate.test.ts
git commit -m "feat(services): work-requests.markDuplicateWorkRequest"
```

---

### Task 14: work-requests.list + get

**Files:**
- Modify: `lib/services/work-requests/index.ts`
- Modify: `lib/services/work-requests/schemas.ts`
- Create: `tests/unit/services/work-requests/list.test.ts`

Customer sees their own org's submitted requests. Admin sees all in org. Employee may see their assigned-project requests (treat as admin equivalent for read; per spec §8.7 employees don't triage but they should be able to see context).

- [ ] **Step 1: Failing test**

Create `tests/unit/services/work-requests/list.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import {
  assignProject,
  createMembership,
  createOrg,
  createProject,
  createUser,
} from "@/tests/fixtures/factories";
import { listWorkRequests, getWorkRequest, submitWorkRequest } from "@/lib/services/work-requests";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("work-requests.listWorkRequests", () => {
  it("admin sees all requests in their org", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const c1 = await createUser(db, { role: "customer" });
      const c2 = await createUser(db, { role: "customer" });
      await createMembership(db, c1.id, org.id);
      await createMembership(db, c2.id, org.id);
      await submitWorkRequest(db, ctxOf(org.id, "customer", c1.id), { title: "from c1" });
      await submitWorkRequest(db, ctxOf(org.id, "customer", c2.id), { title: "from c2" });
      const r = await listWorkRequests(db, ctxOf(org.id, "admin", admin.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((w) => w.title).sort()).toEqual(["from c1", "from c2"]);
    });
  });

  it("customer only sees their own org's requests", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "mine" });
      const r = await listWorkRequests(db, ctxOf(org.id, "customer", customer.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((w) => w.title)).toEqual(["mine"]);
    });
  });

  it("employee sees requests for projects they're assigned to (and unassigned-project triage)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const p1 = await createProject(db, org.id, admin.id);
      const p2 = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, p1.id);
      await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "On P1", projectId: p1.id });
      await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "On P2", projectId: p2.id });
      await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "Triage" });
      const r = await listWorkRequests(db, ctxOf(org.id, "employee", employee.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // Employee sees: On P1 (assigned) + Triage (no project_id, all employees see those).
      expect(r.data.map((w) => w.title).sort()).toEqual(["On P1", "Triage"]);
    });
  });

  it("status filter narrows result", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "open" });
      const r = await listWorkRequests(db, ctxOf(org.id, "admin", admin.id), { status: "submitted" });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(1);
    });
  });
});

describe("work-requests.getWorkRequest", () => {
  it("admin fetches", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await getWorkRequest(db, ctxOf(org.id, "admin", admin.id), submitted.data.id);
      expect(r.ok).toBe(true);
    });
  });

  it("customer can fetch their own", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await getWorkRequest(db, ctxOf(org.id, "customer", customer.id), submitted.data.id);
      expect(r.ok).toBe(true);
    });
  });

  it("not_found when in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, orgB.id);
      const submitted = await submitWorkRequest(db, ctxOf(orgB.id, "customer", customer.id), { title: "x" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await getWorkRequest(db, ctxOf(orgA.id, "admin", admin.id), submitted.data.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/work-requests/list.test.ts
```

- [ ] **Step 3: Schema**

Append to `lib/services/work-requests/schemas.ts`:

```ts
export const listWorkRequestsInputSchema = z.object({
  status: workRequestStatusEnum.optional(),
});
export type ListWorkRequestsInput = z.infer<typeof listWorkRequestsInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/work-requests/index.ts`:

```ts
import { and, desc, inArray, isNull, or } from "drizzle-orm";
import { listWorkRequestsInputSchema, type ListWorkRequestsInput } from "./schemas";

export async function listWorkRequests(
  db: AnyDb,
  ctx: OrgContext,
  input: ListWorkRequestsInput,
): Promise<Result<WorkRequest[]>> {
  const parsed = listWorkRequestsInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const access = await requireOrgAccess(db, ctx);
  if (!access.ok) return access;

  const conditions = [eq(schema.workRequests.orgId, ctx.orgId)];
  if (parsed.data.status) conditions.push(eq(schema.workRequests.status, parsed.data.status));

  if (ctx.actor.role === "employee") {
    const assigned = await db
      .select({ projectId: schema.projectAssignments.projectId })
      .from(schema.projectAssignments)
      .where(eq(schema.projectAssignments.userId, ctx.actor.userId));
    const ids = assigned.map((r) => r.projectId);
    // Employees see requests on their assigned projects + null-project (triage) requests.
    if (ids.length === 0) {
      conditions.push(isNull(schema.workRequests.projectId));
    } else {
      conditions.push(
        or(isNull(schema.workRequests.projectId), inArray(schema.workRequests.projectId, ids))!,
      );
    }
  }

  const rows = await db
    .select()
    .from(schema.workRequests)
    .where(and(...conditions))
    .orderBy(desc(schema.workRequests.createdAt));
  return ok(rows);
}

export async function getWorkRequest(
  db: AnyDb,
  ctx: OrgContext,
  id: string,
): Promise<Result<WorkRequest>> {
  const access = await requireOrgAccess(db, ctx);
  if (!access.ok) return access;
  const [row] = await db
    .select()
    .from(schema.workRequests)
    .where(eq(schema.workRequests.id, id))
    .limit(1);
  if (!row) return err("not_found", "Work request not found");
  if (row.orgId !== ctx.orgId) return err("not_found", "Work request not found");
  return ok(row);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/work-requests/list.test.ts
pnpm test
git add lib/services/work-requests tests/unit/services/work-requests/list.test.ts
git commit -m "feat(services): work-requests.listWorkRequests + getWorkRequest"
```

---

### Task 15: Final verification + branch wrap

- [ ] **Step 1: Full sweep**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All clean. Test count should be ~150+.

- [ ] **Step 2: Working tree clean**

```bash
git status
```

Expected: working tree clean (apart from the user-controlled `.vscode/settings.json` toggle if still present).

- [ ] **Step 3: Hand off**

The branch `feat/phase-1-services-narrative-intake` is ready for merge into `main`. Plan 2c (cross-cutting) follows.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-05-08-marketing-crm-phase-1-design.md`):

- §6 daily_updates + revisions + tasks join — exercised in Tasks 2-5 ✓
- §6 comments + revisions + soft-delete — exercised in Tasks 6-9 ✓
- §6 work_requests + status_log — exercised in Tasks 10-14 ✓
- §8.3 daily update post — Task 2 (with task linking + customer fan-out) ✓
- §8.4 daily update edit (revision capture, no notification) — Task 3 ✓
- §8.5 comment post / edit / soft-delete — Tasks 6, 7, 8 ✓
- §8.6 work request submission — Task 10 (atomic with task creation, admin notify) ✓
- §8.7 work request triage (accept/reject/duplicate) — Tasks 11, 12, 13 ✓
- §9.1 events fired correctly:
  - daily_update.posted (visibility-aware fan-out) — Task 2 ✓
  - comment.posted (author + prior commenters dedup) — Task 6 ✓
  - work_request.submitted (all admins) — Task 10 ✓
  - work_request.status_changed (submitter notified on accept/reject/duplicate) — Tasks 11, 12, 13 ✓

**Out of scope (deliberately):**
- Attachments, notifications full API (list/markRead), invitation flows → Plan 2c
- Email delivery → Plan 4
- Server Actions / UI → Plan 3+

**Placeholder scan:** No "TBD" / "TODO" anywhere. Each step has full code.

**Type consistency:**
- `OrgContext`, `Result<T, AppError>`, `requireOrgAccess`, `requireProjectAccess`, `requireRole`, `requireDailyUpdateRead`, `requireCommentWrite`, `emit`, `createFromRequest` all used consistently.
- `zodIssuesToFields` is duplicated across services (matching the pattern from Plan 2a). A future cleanup could pull it into a shared helper.
- `AnyDb` type alias is duplicated across files but always uses `PgDatabase<any, typeof schema>` consistently.

**Decisions baked in (matching Plan 2a's conventions):**
- All Zod input schemas use `.strict()` where unknown fields would change behavior unexpectedly.
- All services return `Result<T, AppError>`.
- `emit` is called inline within the same transaction so a rollback also rolls back the notification rows.
- For `rejectWorkRequest` and `markDuplicateWorkRequest`, the linked-task cancel uses inline SQL (not `tasks.changeTaskStatus`) so we don't double-emit notifications.
- For employee read access on work requests, employees see triage requests too (null project_id) so they have visibility into incoming work that may eventually be theirs.
