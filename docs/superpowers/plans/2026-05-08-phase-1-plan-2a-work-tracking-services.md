# Phase 1 — Plan 2a: Work-Tracking Services (Projects, Tasks, Time Entries)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the service-layer functions for the three core work-tracking entities — Projects, Tasks, Time Entries — TDD'd against the live Postgres via the existing `withTransaction` fixture. Every function takes `OrgContext` (or `AdminContext`), validates inputs with Zod, calls auth predicates, runs DB operations inside a transaction, and emits domain events for cross-cutting concerns. No UI in this plan; the next plan (Plan 3) wires Server Actions and pages on top.

**Architecture:** Functional services in `lib/services/<feature>/`. Each public function returns `Result<T, AppError>`. Cross-feature calls go through public APIs only. Notifications emit-side gets a minimal internal pipeline (insert `notifications` rows + `notification_deliveries(channel='in_app')` synchronously); email delivery and in-app polling come in Plan 4.

**Tech Stack:** Drizzle ORM, Vitest, Zod, drizzle-zod, all from Plan 1. New: `nanoid` may be useful for IDs in some flows but UUID v7 from the DB is the default.

**Branch:** Implement on `feat/phase-1-services-work-tracking`, branched from `main`. Last main commit is the Plan-1 merge (`6e7c257`).

---

## File structure created by this plan

```
lib/services/
  _auth/
    predicates.ts            (extended with new predicates)
  _schemas/
    common.ts                (shared Zod refinements: idSchema, dateSchema, minutesSchema, ...)
  notifications/
    index.ts                 (public API: emit, ...)
    internal.ts              (recipient resolution + dispatch wiring)
    schemas.ts               (event payload schemas)
  projects/
    index.ts                 (public API)
    internal.ts              (helpers: assertProjectInOrg, etc.)
    schemas.ts               (Zod input shapes)
  tasks/
    index.ts
    internal.ts
    schemas.ts
  time-entries/
    index.ts
    internal.ts
    schemas.ts

tests/unit/services/
  _auth/
    predicates-extended.test.ts        (new predicates only)
  notifications/
    emit.test.ts
  projects/
    create.test.ts
    update.test.ts
    list.test.ts
    archive.test.ts
    assignments.test.ts
  tasks/
    create.test.ts
    create-from-request.test.ts
    update.test.ts
    change-status.test.ts
    assign.test.ts
    list.test.ts
  time-entries/
    log.test.ts
    list.test.ts
    update.test.ts
    delete.test.ts
```

---

## Tasks

### Task 1: Common service-layer helpers — schemas + ID utilities

**Files:**
- Create: `lib/services/_schemas/common.ts`
- Create: `tests/unit/services/_schemas/common.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/_schemas/common.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { idSchema, dateSchema, positiveIntSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

describe("idSchema", () => {
  it("accepts a UUID v7", () => {
    const r = idSchema.safeParse("0190b7f3-c3a8-7000-8000-000000000001");
    expect(r.success).toBe(true);
  });
  it("rejects non-uuid strings", () => {
    const r = idSchema.safeParse("not-a-uuid");
    expect(r.success).toBe(false);
  });
  it("accepts Better Auth string IDs (non-uuid)", () => {
    // Better Auth uses string IDs like "usr_xxx" or "org_xxx"
    const r = idSchema.safeParse("usr_abc123");
    expect(r.success).toBe(true);
  });
});

describe("dateSchema", () => {
  it("accepts ISO date strings", () => {
    expect(dateSchema.safeParse("2026-05-08").success).toBe(true);
  });
  it("rejects malformed dates", () => {
    expect(dateSchema.safeParse("not-a-date").success).toBe(false);
    expect(dateSchema.safeParse("2026-13-01").success).toBe(false);
  });
});

describe("positiveIntSchema", () => {
  it("accepts positive integers", () => {
    expect(positiveIntSchema.safeParse(1).success).toBe(true);
    expect(positiveIntSchema.safeParse(60).success).toBe(true);
  });
  it("rejects zero, negatives, and floats", () => {
    expect(positiveIntSchema.safeParse(0).success).toBe(false);
    expect(positiveIntSchema.safeParse(-1).success).toBe(false);
    expect(positiveIntSchema.safeParse(1.5).success).toBe(false);
  });
});

describe("nonEmptyStringSchema", () => {
  it("rejects empty + whitespace-only strings", () => {
    expect(nonEmptyStringSchema.safeParse("").success).toBe(false);
    expect(nonEmptyStringSchema.safeParse("   ").success).toBe(false);
  });
  it("accepts non-empty strings, trimmed", () => {
    const r = nonEmptyStringSchema.safeParse("  hello  ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("hello");
  });
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/_schemas/common.test.ts
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `lib/services/_schemas/common.ts`:

```ts
import { z } from "zod";

// Accepts UUIDs (our domain IDs) AND Better Auth string IDs (e.g., "usr_abc").
// Just enforces non-empty and length sanity.
export const idSchema = z.string().min(1).max(128);

// ISO date format, e.g. "2026-05-08". Postgres `date` type expects this.
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid calendar date");

export const positiveIntSchema = z.number().int().positive();

export const nonEmptyStringSchema = z
  .string()
  .trim()
  .min(1, "Required");
```

- [ ] **Step 4: GREEN**

```bash
pnpm test tests/unit/services/_schemas/common.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/phase-1-services-work-tracking
git add lib/services/_schemas tests/unit/services/_schemas
git commit -m "feat(services): common Zod schemas (id, date, positiveInt, nonEmptyString)"
```

---

### Task 2: Additional auth predicates — requireTaskRead, requireTaskWrite

**Files:**
- Modify: `lib/services/_auth/predicates.ts`
- Create: `tests/unit/services/_auth/predicates-extended.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/_auth/predicates-extended.test.ts`:

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
  requireTaskRead,
  requireTaskWrite,
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

async function createTask(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  projectId: string,
  createdBy: string,
  customerVisible = true,
) {
  const [row] = await db
    .insert(schema.tasks)
    .values({
      orgId,
      projectId,
      title: "Test task",
      source: "admin_created",
      createdBy,
      customerVisible,
    })
    .returning();
  return row!;
}

describe("requireTaskRead", () => {
  it("ok for admin", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await requireTaskRead(db, orgCtx(org.id, "admin", admin.id), task.id);
      expect(r.ok).toBe(true);
    });
  });

  it("ok for assigned employee", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await requireTaskRead(db, orgCtx(org.id, "employee", employee.id), task.id);
      expect(r.ok).toBe(true);
    });
  });

  it("unauthorized for unassigned employee", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await requireTaskRead(db, orgCtx(org.id, "employee", employee.id), task.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("ok for customer when task is customer_visible", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id, true);
      const r = await requireTaskRead(db, orgCtx(org.id, "customer", customer.id), task.id);
      expect(r.ok).toBe(true);
    });
  });

  it("unauthorized for customer when task is internal-only", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id, false);
      const r = await requireTaskRead(db, orgCtx(org.id, "customer", customer.id), task.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("not_found if task is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const task = await createTask(db, orgB.id, project.id, admin.id);
      const r = await requireTaskRead(db, orgCtx(orgA.id, "admin", admin.id), task.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

describe("requireTaskWrite", () => {
  it("ok for admin", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await requireTaskWrite(db, orgCtx(org.id, "admin", admin.id), task.id);
      expect(r.ok).toBe(true);
    });
  });

  it("ok for employee assigned to project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await requireTaskWrite(db, orgCtx(org.id, "employee", employee.id), task.id);
      expect(r.ok).toBe(true);
    });
  });

  it("unauthorized for customer always", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await requireTaskWrite(db, orgCtx(org.id, "customer", customer.id), task.id);
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
pnpm test tests/unit/services/_auth/predicates-extended.test.ts
```
Expected: FAIL — `requireTaskRead`/`requireTaskWrite` not exported.

- [ ] **Step 3: Implement**

Append to `lib/services/_auth/predicates.ts` (keep existing exports):

```ts
import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import type { OrgContext } from "@/lib/services/_context";

type AnyDb = PgDatabase<any, typeof schema>;

// existing requireOrgAccess, requireProjectAccess, requireRole keep their exports.
// Add the following new exports:

export async function requireTaskRead(
  db: AnyDb,
  ctx: OrgContext,
  taskId: string,
): Promise<Result<true>> {
  const [task] = await db
    .select({
      id: schema.tasks.id,
      orgId: schema.tasks.orgId,
      projectId: schema.tasks.projectId,
      customerVisible: schema.tasks.customerVisible,
    })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId))
    .limit(1);
  if (!task) return err("not_found", "Task not found");
  if (task.orgId !== ctx.orgId) return err("not_found", "Task not found");

  if (ctx.actor.role === "admin") return ok(true);

  if (ctx.actor.role === "customer") {
    if (!task.customerVisible) return err("unauthorized", "Not visible to customers");
    if (!task.projectId) return err("unauthorized", "Task is not yet assigned to a project");
    // Customer must also be a member of the org (predicate already covers this elsewhere
    // via requireOrgAccess, but we re-check here so a standalone read-check is sufficient).
    return requireOrgAccess(db, ctx);
  }

  // employee
  if (!task.projectId) return err("unauthorized", "Task is in triage queue");
  const assigned = await db
    .select({ projectId: schema.projectAssignments.projectId })
    .from(schema.projectAssignments)
    .where(
      and(
        eq(schema.projectAssignments.userId, ctx.actor.userId),
        eq(schema.projectAssignments.projectId, task.projectId),
      ),
    )
    .limit(1);
  if (assigned.length === 0) return err("unauthorized", "Not assigned to this project");
  return ok(true);
}

export async function requireTaskWrite(
  db: AnyDb,
  ctx: OrgContext,
  taskId: string,
): Promise<Result<true>> {
  if (ctx.actor.role === "customer") return err("unauthorized", "Customers cannot write tasks");

  const [task] = await db
    .select({
      id: schema.tasks.id,
      orgId: schema.tasks.orgId,
      projectId: schema.tasks.projectId,
    })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId))
    .limit(1);
  if (!task) return err("not_found", "Task not found");
  if (task.orgId !== ctx.orgId) return err("not_found", "Task not found");

  if (ctx.actor.role === "admin") return ok(true);

  // employee — write requires project assignment, even for triage tasks (no project_id)
  // they shouldn't be able to write since they're not assigned to anything.
  if (!task.projectId) return err("unauthorized", "Task is in triage queue");
  const assigned = await db
    .select({ projectId: schema.projectAssignments.projectId })
    .from(schema.projectAssignments)
    .where(
      and(
        eq(schema.projectAssignments.userId, ctx.actor.userId),
        eq(schema.projectAssignments.projectId, task.projectId),
      ),
    )
    .limit(1);
  if (assigned.length === 0) return err("unauthorized", "Not assigned to this project");
  return ok(true);
}
```

- [ ] **Step 4: GREEN**

```bash
pnpm test tests/unit/services/_auth/predicates-extended.test.ts
pnpm test  # all tests still pass
```
Expected: 9 new tests pass; total 30 tests across the project.

- [ ] **Step 5: Commit**

```bash
git add lib/services/_auth/predicates.ts tests/unit/services/_auth/predicates-extended.test.ts
git commit -m "feat(services): requireTaskRead + requireTaskWrite predicates with TDD coverage"
```

---

### Task 3: Internal notification emit (in-app delivery only; email deferred to Plan 4)

**Files:**
- Create: `lib/services/notifications/index.ts`
- Create: `lib/services/notifications/internal.ts`
- Create: `lib/services/notifications/schemas.ts`
- Create: `tests/unit/services/notifications/emit.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/notifications/emit.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { emit } from "@/lib/services/notifications";

describe("notifications.emit", () => {
  it("inserts a notifications row + in_app delivery for each recipient", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const u1 = await createUser(db, { role: "employee" });
      const u2 = await createUser(db, { role: "employee" });

      await emit(db, {
        orgId: org.id,
        eventType: "task.assigned",
        recipientUserIds: [u1.id, u2.id],
        payload: { taskId: "t-1", actorId: "a-1" },
        relatedType: "task",
        relatedId: "t-1-uuid",
      });

      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.orgId, org.id));
      expect(notifs).toHaveLength(2);
      expect(notifs.map((n) => n.userId).sort()).toEqual([u1.id, u2.id].sort());

      const deliveries = await db.select().from(schema.notificationDeliveries);
      expect(deliveries.filter((d) => d.channel === "in_app")).toHaveLength(2);
      // Email deliveries deferred to Plan 4; emit() does NOT create email rows yet.
      expect(deliveries.filter((d) => d.channel === "email")).toHaveLength(0);
    });
  });

  it("deduplicates recipients", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const u1 = await createUser(db, { role: "employee" });
      await emit(db, {
        orgId: org.id,
        eventType: "task.assigned",
        recipientUserIds: [u1.id, u1.id, u1.id],
        payload: { taskId: "t-1", actorId: "a-1" },
      });
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.orgId, org.id));
      expect(notifs).toHaveLength(1);
    });
  });

  it("respects user-level preference override (email_enabled=false has no effect since email not implemented)", async () => {
    // Phase 1 emit only handles in_app; the preference column for in_app should be honored.
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const u1 = await createUser(db, { role: "employee" });
      // Disable in-app for this user + event type
      await db.insert(schema.notificationPreferences).values({
        userId: u1.id,
        orgId: org.id,
        eventType: "task.assigned",
        inAppEnabled: false,
        emailEnabled: false,
      });
      await emit(db, {
        orgId: org.id,
        eventType: "task.assigned",
        recipientUserIds: [u1.id],
        payload: { taskId: "t-1", actorId: "a-1" },
      });
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.orgId, org.id));
      expect(notifs).toHaveLength(0);
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/notifications/emit.test.ts
```
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Schemas**

Create `lib/services/notifications/schemas.ts`:

```ts
import { z } from "zod";

export const emitInputSchema = z.object({
  orgId: z.string().min(1),
  eventType: z.string().min(1),
  recipientUserIds: z.array(z.string().min(1)).min(1),
  payload: z.record(z.unknown()),
  relatedType: z.string().optional(),
  relatedId: z.string().optional(),
});

export type EmitInput = z.infer<typeof emitInputSchema>;
```

- [ ] **Step 4: Internal helpers**

Create `lib/services/notifications/internal.ts`:

```ts
import { and, eq, or, isNull } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

type AnyDb = PgDatabase<any, typeof schema>;

export type ResolvedPreference = {
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
};

/**
 * Resolve effective notification preferences for a set of users + a single event type
 * within an org. Returns one entry per user, defaulting to (true, true) if neither
 * a user-specific nor org-wide row exists.
 */
export async function resolvePreferences(
  db: AnyDb,
  orgId: string,
  eventType: string,
  userIds: string[],
): Promise<ResolvedPreference[]> {
  if (userIds.length === 0) return [];

  // Fetch all relevant preference rows in one query: user-specific OR org-default.
  const rows = await db
    .select({
      userId: schema.notificationPreferences.userId,
      inAppEnabled: schema.notificationPreferences.inAppEnabled,
      emailEnabled: schema.notificationPreferences.emailEnabled,
    })
    .from(schema.notificationPreferences)
    .where(
      and(
        eq(schema.notificationPreferences.orgId, orgId),
        eq(schema.notificationPreferences.eventType, eventType),
        or(
          isNull(schema.notificationPreferences.userId),
          // userId IN (...): we'll filter in JS below since drizzle's inArray is awkward
          // with optional types in some adapters.
        ),
      ),
    );

  const orgDefault = rows.find((r) => r.userId === null);
  const userOverrides = new Map(
    rows.filter((r) => r.userId !== null).map((r) => [r.userId!, r]),
  );

  return userIds.map((uid) => {
    const override = userOverrides.get(uid);
    if (override) return { userId: uid, inAppEnabled: override.inAppEnabled, emailEnabled: override.emailEnabled };
    if (orgDefault) return { userId: uid, inAppEnabled: orgDefault.inAppEnabled, emailEnabled: orgDefault.emailEnabled };
    return { userId: uid, inAppEnabled: true, emailEnabled: true };
  });
}
```

Note: the `or` clause above as written includes `isNull(userId)` only — we need to also filter to `userId IN userIds OR userId IS NULL`. Update the WHERE to use `inArray`:

```ts
import { and, eq, inArray, isNull, or } from "drizzle-orm";
// ...
.where(
  and(
    eq(schema.notificationPreferences.orgId, orgId),
    eq(schema.notificationPreferences.eventType, eventType),
    or(
      isNull(schema.notificationPreferences.userId),
      inArray(schema.notificationPreferences.userId, userIds),
    ),
  ),
)
```

- [ ] **Step 5: Public API**

Create `lib/services/notifications/index.ts`:

```ts
import * as schema from "@/lib/db/schema";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { emitInputSchema, type EmitInput } from "./schemas";
import { resolvePreferences } from "./internal";

type AnyDb = PgDatabase<any, typeof schema>;

/**
 * Insert notification rows + in_app delivery rows for each recipient
 * whose effective preference allows it. Email delivery is deferred to Plan 4.
 *
 * Idempotent on duplicate recipientUserIds (deduped before insert).
 *
 * Note: this function is intended to be called inside an enclosing transaction
 * — typically right after a write. Callers should pass the transactional `tx`
 * that wraps their domain write so a rollback also rolls back the notifications.
 */
export async function emit(db: AnyDb, input: EmitInput): Promise<void> {
  const parsed = emitInputSchema.parse(input);
  const uniqueRecipients = Array.from(new Set(parsed.recipientUserIds));

  const prefs = await resolvePreferences(db, parsed.orgId, parsed.eventType, uniqueRecipients);
  const inAppRecipients = prefs.filter((p) => p.inAppEnabled).map((p) => p.userId);

  if (inAppRecipients.length === 0) return;

  const inserted = await db
    .insert(schema.notifications)
    .values(
      inAppRecipients.map((userId) => ({
        orgId: parsed.orgId,
        userId,
        eventType: parsed.eventType,
        payload: parsed.payload,
        relatedType: parsed.relatedType ?? null,
        relatedId: parsed.relatedId ?? null,
      })),
    )
    .returning({ id: schema.notifications.id });

  await db.insert(schema.notificationDeliveries).values(
    inserted.map((row) => ({
      notificationId: row.id,
      channel: "in_app" as const,
      status: "sent" as const,
      sentAt: new Date(),
    })),
  );
}
```

- [ ] **Step 6: GREEN**

```bash
pnpm test tests/unit/services/notifications/emit.test.ts
pnpm test
```
Expected: 3 new tests pass; total 33 tests project-wide.

- [ ] **Step 7: Commit**

```bash
git add lib/services/notifications tests/unit/services/notifications
git commit -m "feat(services): notifications.emit (in-app insert + preference resolution)"
```

---

### Task 4: Projects — createProject (admin only)

**Files:**
- Create: `lib/services/projects/index.ts`
- Create: `lib/services/projects/internal.ts`
- Create: `lib/services/projects/schemas.ts`
- Create: `tests/unit/services/projects/create.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/projects/create.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createUser, createMembership } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { createProject } from "@/lib/services/projects";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("projects.createProject", () => {
  it("admin can create a project; row has correct fields and defaults", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });

      const result = await createProject(db, ctxOf(org.id, "admin", admin.id), {
        name: "Acme SEO Q3",
        description: "Quarterly SEO retainer",
        serviceType: "seo",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.name).toBe("Acme SEO Q3");
      expect(result.data.serviceType).toBe("seo");
      expect(result.data.status).toBe("draft");
      expect(result.data.orgId).toBe(org.id);
      expect(result.data.createdBy).toBe(admin.id);

      const found = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, result.data.id));
      expect(found).toHaveLength(1);
    });
  });

  it("rejects empty name with validation error + field", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const result = await createProject(db, ctxOf(org.id, "admin", admin.id), {
        name: "",
        serviceType: "seo",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("validation");
        expect(result.error.fields?.name).toBeDefined();
      }
    });
  });

  it("employee cannot create a project (unauthorized)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const employee = await createUser(db, { role: "employee" });
      const result = await createProject(db, ctxOf(org.id, "employee", employee.id), {
        name: "Acme",
        serviceType: "seo",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("unauthorized");
    });
  });

  it("customer cannot create a project (unauthorized)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const result = await createProject(db, ctxOf(org.id, "customer", customer.id), {
        name: "Acme",
        serviceType: "seo",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("unauthorized");
    });
  });

  it("supports optional description, dates, and hourly rate", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const result = await createProject(db, ctxOf(org.id, "admin", admin.id), {
        name: "With dates",
        description: "Has details",
        serviceType: "paid_ads",
        startDate: "2026-06-01",
        endDate: "2026-12-31",
        hourlyRateCents: 25000,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.description).toBe("Has details");
      expect(result.data.startDate).toBe("2026-06-01");
      expect(result.data.endDate).toBe("2026-12-31");
      expect(result.data.hourlyRateCents).toBe(25000);
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/projects/create.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Schemas**

Create `lib/services/projects/schemas.ts`:

```ts
import { z } from "zod";
import { dateSchema, nonEmptyStringSchema, positiveIntSchema } from "@/lib/services/_schemas/common";

export const serviceTypeEnum = z.enum(["seo", "paid_ads", "social", "content", "web", "other"]);

export const projectStatusEnum = z.enum(["draft", "active", "paused", "completed", "archived"]);

export const createProjectInputSchema = z.object({
  name: nonEmptyStringSchema.max(200),
  description: z.string().max(5000).optional(),
  serviceType: serviceTypeEnum,
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  hourlyRateCents: positiveIntSchema.optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
```

- [ ] **Step 4: Implement**

Create `lib/services/projects/index.ts`:

```ts
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireRole } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { createProjectInputSchema, type CreateProjectInput } from "./schemas";

type AnyDb = PgDatabase<any, typeof schema>;
type Project = typeof schema.projects.$inferSelect;

function zodIssuesToFields(issues: { path: (string | number)[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function createProject(
  db: AnyDb,
  ctx: OrgContext,
  input: CreateProjectInput,
): Promise<Result<Project>> {
  const parsed = createProjectInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  const [row] = await db
    .insert(schema.projects)
    .values({
      orgId: ctx.orgId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      serviceType: parsed.data.serviceType,
      startDate: parsed.data.startDate ?? null,
      endDate: parsed.data.endDate ?? null,
      hourlyRateCents: parsed.data.hourlyRateCents ?? null,
      createdBy: ctx.actor.userId,
    })
    .returning();
  return ok(row!);
}
```

Internal stub for future cross-feature helpers — create `lib/services/projects/internal.ts`:

```ts
// Internal helpers for the projects service. Populated as later operations need them.
export {};
```

- [ ] **Step 5: GREEN**

```bash
pnpm test tests/unit/services/projects/create.test.ts
pnpm test
```
Expected: 5 new tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/services/projects tests/unit/services/projects/create.test.ts
git commit -m "feat(services): projects.createProject (admin-only) with TDD"
```

---

### Task 5: Projects — updateProject

**Files:**
- Modify: `lib/services/projects/index.ts`
- Modify: `lib/services/projects/schemas.ts`
- Create: `tests/unit/services/projects/update.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/projects/update.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject as createProjectFixture, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { updateProject } from "@/lib/services/projects";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("projects.updateProject", () => {
  it("admin can update name + description + status", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProjectFixture(db, org.id, admin.id, { status: "draft" });

      const r = await updateProject(db, ctxOf(org.id, "admin", admin.id), {
        id: project.id,
        name: "Updated",
        description: "New description",
        status: "active",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.name).toBe("Updated");
      expect(r.data.description).toBe("New description");
      expect(r.data.status).toBe("active");
    });
  });

  it("not_found if project belongs to another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProjectFixture(db, orgB.id, admin.id);
      const r = await updateProject(db, ctxOf(orgA.id, "admin", admin.id), {
        id: project.id,
        name: "Updated",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });

  it("employee cannot update a project (unauthorized)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, org.id, admin.id);
      const r = await updateProject(db, ctxOf(org.id, "employee", employee.id), {
        id: project.id,
        name: "Updated",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("status transition to 'archived' sets archivedAt", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProjectFixture(db, org.id, admin.id, { status: "active" });
      const r = await updateProject(db, ctxOf(org.id, "admin", admin.id), {
        id: project.id,
        status: "archived",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("archived");
      expect(r.data.archivedAt).not.toBeNull();
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/projects/update.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Schema additions**

Append to `lib/services/projects/schemas.ts`:

```ts
import { idSchema } from "@/lib/services/_schemas/common";

export const updateProjectInputSchema = z
  .object({
    id: idSchema,
    name: nonEmptyStringSchema.max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    serviceType: serviceTypeEnum.optional(),
    status: projectStatusEnum.optional(),
    startDate: dateSchema.nullable().optional(),
    endDate: dateSchema.nullable().optional(),
    hourlyRateCents: positiveIntSchema.nullable().optional(),
  });

export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/projects/index.ts`:

```ts
import { eq } from "drizzle-orm";
import { updateProjectInputSchema, type UpdateProjectInput } from "./schemas";

export async function updateProject(
  db: AnyDb,
  ctx: OrgContext,
  input: UpdateProjectInput,
): Promise<Result<Project>> {
  const parsed = updateProjectInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  const [existing] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, parsed.data.id))
    .limit(1);
  if (!existing) return err("not_found", "Project not found");
  if (existing.orgId !== ctx.orgId) return err("not_found", "Project not found");

  const updates: Partial<typeof schema.projects.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.serviceType !== undefined) updates.serviceType = parsed.data.serviceType;
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status;
    if (parsed.data.status === "archived" && existing.status !== "archived") {
      updates.archivedAt = new Date();
    } else if (parsed.data.status !== "archived") {
      updates.archivedAt = null;
    }
  }
  if (parsed.data.startDate !== undefined) updates.startDate = parsed.data.startDate;
  if (parsed.data.endDate !== undefined) updates.endDate = parsed.data.endDate;
  if (parsed.data.hourlyRateCents !== undefined) updates.hourlyRateCents = parsed.data.hourlyRateCents;

  const [row] = await db
    .update(schema.projects)
    .set(updates)
    .where(eq(schema.projects.id, parsed.data.id))
    .returning();
  return ok(row!);
}
```

- [ ] **Step 5: GREEN**

```bash
pnpm test tests/unit/services/projects/update.test.ts
pnpm test
```
Expected: 4 new tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/services/projects tests/unit/services/projects/update.test.ts
git commit -m "feat(services): projects.updateProject with status transition + archivedAt"
```

---

### Task 6: Projects — listProjects + getProject (role-scoped reads)

**Files:**
- Modify: `lib/services/projects/index.ts`
- Create: `tests/unit/services/projects/list.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/projects/list.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { assignProject, createMembership, createOrg, createProject as createProjectFixture, createUser } from "@/tests/fixtures/factories";
import { listProjects, getProject } from "@/lib/services/projects";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("projects.listProjects", () => {
  it("admin sees all projects in their ctx.orgId", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      await createProjectFixture(db, org.id, admin.id, { name: "P1" });
      await createProjectFixture(db, org.id, admin.id, { name: "P2" });
      const r = await listProjects(db, ctxOf(org.id, "admin", admin.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((p) => p.name).sort()).toEqual(["P1", "P2"]);
    });
  });

  it("employee only sees projects they're assigned to", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const p1 = await createProjectFixture(db, org.id, admin.id, { name: "P1" });
      await createProjectFixture(db, org.id, admin.id, { name: "P2" });
      await assignProject(db, employee.id, p1.id);
      const r = await listProjects(db, ctxOf(org.id, "employee", employee.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((p) => p.name)).toEqual(["P1"]);
    });
  });

  it("customer sees all non-draft projects in their org", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      await createProjectFixture(db, org.id, admin.id, { name: "Active", status: "active" });
      await createProjectFixture(db, org.id, admin.id, { name: "Draft", status: "draft" });
      const r = await listProjects(db, ctxOf(org.id, "customer", customer.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((p) => p.name)).toEqual(["Active"]);
    });
  });

  it("status filter narrows the result", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      await createProjectFixture(db, org.id, admin.id, { name: "Active", status: "active" });
      await createProjectFixture(db, org.id, admin.id, { name: "Archived", status: "archived" });
      const r = await listProjects(db, ctxOf(org.id, "admin", admin.id), { status: "active" });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((p) => p.name)).toEqual(["Active"]);
    });
  });
});

describe("projects.getProject", () => {
  it("returns the project for an admin", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProjectFixture(db, org.id, admin.id);
      const r = await getProject(db, ctxOf(org.id, "admin", admin.id), project.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.id).toBe(project.id);
    });
  });

  it("not_found if customer requests a draft project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProjectFixture(db, org.id, admin.id, { status: "draft" });
      const r = await getProject(db, ctxOf(org.id, "customer", customer.id), project.id);
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
pnpm test tests/unit/services/projects/list.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Schemas**

Append to `lib/services/projects/schemas.ts`:

```ts
export const listProjectsInputSchema = z.object({
  status: projectStatusEnum.optional(),
});
export type ListProjectsInput = z.infer<typeof listProjectsInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/projects/index.ts`:

```ts
import { and, eq, inArray, ne } from "drizzle-orm";
import { requireOrgAccess, requireProjectAccess } from "@/lib/services/_auth/predicates";
import { listProjectsInputSchema, type ListProjectsInput } from "./schemas";

export async function listProjects(
  db: AnyDb,
  ctx: OrgContext,
  input: ListProjectsInput,
): Promise<Result<Project[]>> {
  const parsed = listProjectsInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const access = await requireOrgAccess(db, ctx);
  if (!access.ok) return access;

  const conditions = [eq(schema.projects.orgId, ctx.orgId)];
  if (parsed.data.status) conditions.push(eq(schema.projects.status, parsed.data.status));

  if (ctx.actor.role === "customer") {
    // Customers don't see draft projects.
    conditions.push(ne(schema.projects.status, "draft"));
  }

  if (ctx.actor.role === "employee") {
    // Employees only see projects they're assigned to.
    const assignedRows = await db
      .select({ projectId: schema.projectAssignments.projectId })
      .from(schema.projectAssignments)
      .where(eq(schema.projectAssignments.userId, ctx.actor.userId));
    const assignedIds = assignedRows.map((r) => r.projectId);
    if (assignedIds.length === 0) return ok([]);
    conditions.push(inArray(schema.projects.id, assignedIds));
  }

  const rows = await db
    .select()
    .from(schema.projects)
    .where(and(...conditions))
    .orderBy(schema.projects.name);
  return ok(rows);
}

export async function getProject(
  db: AnyDb,
  ctx: OrgContext,
  projectId: string,
): Promise<Result<Project>> {
  const access = await requireProjectAccess(db, ctx, projectId);
  if (!access.ok) return access;

  const [row] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!row) return err("not_found", "Project not found");

  // Customer-specific: hide draft projects even though requireProjectAccess passed.
  if (ctx.actor.role === "customer" && row.status === "draft") {
    return err("not_found", "Project not found");
  }
  return ok(row);
}
```

- [ ] **Step 5: GREEN**

```bash
pnpm test tests/unit/services/projects/list.test.ts
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add lib/services/projects tests/unit/services/projects/list.test.ts
git commit -m "feat(services): projects.listProjects + getProject with role-scoped visibility"
```

---

### Task 7: Projects — assignToProject + unassignFromProject

**Files:**
- Modify: `lib/services/projects/index.ts`
- Modify: `lib/services/projects/schemas.ts`
- Create: `tests/unit/services/projects/assignments.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/projects/assignments.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject as createProjectFixture, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { assignToProject, unassignFromProject } from "@/lib/services/projects";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("projects.assignToProject", () => {
  it("admin can assign an employee to a project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, org.id, admin.id);
      const r = await assignToProject(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        userId: employee.id,
      });
      expect(r.ok).toBe(true);
      const found = await db
        .select()
        .from(schema.projectAssignments)
        .where(
          and(
            eq(schema.projectAssignments.projectId, project.id),
            eq(schema.projectAssignments.userId, employee.id),
          ),
        );
      expect(found).toHaveLength(1);
    });
  });

  it("idempotent on duplicate assign", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, org.id, admin.id);
      const r1 = await assignToProject(db, ctxOf(org.id, "admin", admin.id), { projectId: project.id, userId: employee.id });
      const r2 = await assignToProject(db, ctxOf(org.id, "admin", admin.id), { projectId: project.id, userId: employee.id });
      expect(r1.ok && r2.ok).toBe(true);
      const found = await db.select().from(schema.projectAssignments);
      expect(found).toHaveLength(1);
    });
  });

  it("rejects assigning a customer (only staff can be assigned)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProjectFixture(db, org.id, admin.id);
      const r = await assignToProject(db, ctxOf(org.id, "admin", admin.id), { projectId: project.id, userId: customer.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("non-admin cannot assign", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, org.id, admin.id);
      const r = await assignToProject(db, ctxOf(org.id, "employee", employee.id), { projectId: project.id, userId: employee.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("not_found when project is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, orgB.id, admin.id);
      const r = await assignToProject(db, ctxOf(orgA.id, "admin", admin.id), { projectId: project.id, userId: employee.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

describe("projects.unassignFromProject", () => {
  it("admin can unassign", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, org.id, admin.id);
      await db.insert(schema.projectAssignments).values({ userId: employee.id, projectId: project.id });
      const r = await unassignFromProject(db, ctxOf(org.id, "admin", admin.id), { projectId: project.id, userId: employee.id });
      expect(r.ok).toBe(true);
      const found = await db.select().from(schema.projectAssignments);
      expect(found).toHaveLength(0);
    });
  });

  it("idempotent when no assignment exists", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, org.id, admin.id);
      const r = await unassignFromProject(db, ctxOf(org.id, "admin", admin.id), { projectId: project.id, userId: employee.id });
      expect(r.ok).toBe(true);
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/projects/assignments.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Schemas**

Append to `lib/services/projects/schemas.ts`:

```ts
export const assignmentInputSchema = z.object({
  projectId: idSchema,
  userId: idSchema,
});
export type AssignmentInput = z.infer<typeof assignmentInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/projects/index.ts`:

```ts
import { assignmentInputSchema, type AssignmentInput } from "./schemas";

export async function assignToProject(
  db: AnyDb,
  ctx: OrgContext,
  input: AssignmentInput,
): Promise<Result<true>> {
  const parsed = assignmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  // Project must exist and be in this org.
  const [project] = await db
    .select({ id: schema.projects.id, orgId: schema.projects.orgId })
    .from(schema.projects)
    .where(eq(schema.projects.id, parsed.data.projectId))
    .limit(1);
  if (!project) return err("not_found", "Project not found");
  if (project.orgId !== ctx.orgId) return err("not_found", "Project not found");

  // User must be staff (employee or admin), not a customer.
  const [user] = await db
    .select({ id: schema.users.id, systemRole: schema.users.systemRole })
    .from(schema.users)
    .where(eq(schema.users.id, parsed.data.userId))
    .limit(1);
  if (!user) return err("not_found", "User not found");
  if (user.systemRole === "customer") {
    return err("validation", "Only staff can be assigned to projects", {
      fields: { userId: "Customers cannot be assigned" },
    });
  }

  // Idempotent insert.
  await db
    .insert(schema.projectAssignments)
    .values({ userId: parsed.data.userId, projectId: parsed.data.projectId })
    .onConflictDoNothing();
  return ok(true);
}

export async function unassignFromProject(
  db: AnyDb,
  ctx: OrgContext,
  input: AssignmentInput,
): Promise<Result<true>> {
  const parsed = assignmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  const [project] = await db
    .select({ id: schema.projects.id, orgId: schema.projects.orgId })
    .from(schema.projects)
    .where(eq(schema.projects.id, parsed.data.projectId))
    .limit(1);
  if (!project) return err("not_found", "Project not found");
  if (project.orgId !== ctx.orgId) return err("not_found", "Project not found");

  await db
    .delete(schema.projectAssignments)
    .where(
      and(
        eq(schema.projectAssignments.projectId, parsed.data.projectId),
        eq(schema.projectAssignments.userId, parsed.data.userId),
      ),
    );
  return ok(true);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/projects/assignments.test.ts
pnpm test
git add lib/services/projects tests/unit/services/projects/assignments.test.ts
git commit -m "feat(services): projects.assignToProject + unassignFromProject (admin-only)"
```

---

### Task 8: Tasks — createTask (admin manual create)

**Files:**
- Create: `lib/services/tasks/index.ts`
- Create: `lib/services/tasks/internal.ts`
- Create: `lib/services/tasks/schemas.ts`
- Create: `tests/unit/services/tasks/create.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/tasks/create.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { createTask } from "@/lib/services/tasks";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("tasks.createTask", () => {
  it("admin can create a task tied to a project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const r = await createTask(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        title: "Initial keyword research",
        priority: "high",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.title).toBe("Initial keyword research");
      expect(r.data.priority).toBe("high");
      expect(r.data.status).toBe("todo");
      expect(r.data.source).toBe("admin_created");
      expect(r.data.projectId).toBe(project.id);
      expect(r.data.customerVisible).toBe(true); // default
    });
  });

  it("inserts a task_status_log row for the create event", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const r = await createTask(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        title: "T1",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const logs = await db
        .select()
        .from(schema.taskStatusLog)
        .where(eq(schema.taskStatusLog.taskId, r.data.id));
      expect(logs).toHaveLength(1);
      expect(logs[0]!.fromStatus).toBeNull();
      expect(logs[0]!.toStatus).toBe("todo");
    });
  });

  it("customer cannot create tasks", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      const project = await createProject(db, org.id, admin.id);
      const r = await createTask(db, ctxOf(org.id, "customer", customer.id), {
        projectId: project.id,
        title: "T1",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("not_found when project is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const r = await createTask(db, ctxOf(orgA.id, "admin", admin.id), {
        projectId: project.id,
        title: "T1",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });

  it("rejects empty title", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const r = await createTask(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        title: "",
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
pnpm test tests/unit/services/tasks/create.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Schemas**

Create `lib/services/tasks/schemas.ts`:

```ts
import { z } from "zod";
import { dateSchema, idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const taskStatusEnum = z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]);
export const priorityEnum = z.enum(["low", "normal", "high", "urgent"]);

export const createTaskInputSchema = z.object({
  projectId: idSchema,
  title: nonEmptyStringSchema.max(200),
  description: z.string().max(10000).optional(),
  priority: priorityEnum.optional(),
  dueDate: dateSchema.optional(),
  customerVisible: z.boolean().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
```

- [ ] **Step 4: Internal helper**

Create `lib/services/tasks/internal.ts`:

```ts
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

type AnyDb = PgDatabase<any, typeof schema>;

export async function logStatusTransition(
  db: AnyDb,
  taskId: string,
  fromStatus: string | null,
  toStatus: string,
  changedBy: string,
  note?: string,
) {
  await db.insert(schema.taskStatusLog).values({
    taskId,
    fromStatus,
    toStatus,
    changedBy,
    note: note ?? null,
  });
}
```

- [ ] **Step 5: Implement createTask**

Create `lib/services/tasks/index.ts`:

```ts
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireRole } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { createTaskInputSchema, type CreateTaskInput } from "./schemas";
import { logStatusTransition } from "./internal";

type AnyDb = PgDatabase<any, typeof schema>;
type Task = typeof schema.tasks.$inferSelect;

function zodIssuesToFields(issues: { path: (string | number)[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function createTask(
  db: AnyDb,
  ctx: OrgContext,
  input: CreateTaskInput,
): Promise<Result<Task>> {
  const parsed = createTaskInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  // Customer: unauthorized. Employee: also unauthorized for manual create (admin-only).
  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  // Project must exist + belong to ctx.orgId.
  const [project] = await db
    .select({ id: schema.projects.id, orgId: schema.projects.orgId })
    .from(schema.projects)
    .where(eq(schema.projects.id, parsed.data.projectId))
    .limit(1);
  if (!project) return err("not_found", "Project not found");
  if (project.orgId !== ctx.orgId) return err("not_found", "Project not found");

  const [row] = await db
    .insert(schema.tasks)
    .values({
      orgId: ctx.orgId,
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priority: parsed.data.priority ?? "normal",
      dueDate: parsed.data.dueDate ?? null,
      customerVisible: parsed.data.customerVisible ?? true,
      source: "admin_created",
      sourceRequestId: null,
      createdBy: ctx.actor.userId,
    })
    .returning();
  await logStatusTransition(db, row!.id, null, "todo", ctx.actor.userId);
  return ok(row!);
}
```

- [ ] **Step 6: GREEN + commit**

```bash
pnpm test tests/unit/services/tasks/create.test.ts
pnpm test
git add lib/services/tasks tests/unit/services/tasks/create.test.ts
git commit -m "feat(services): tasks.createTask (admin) + initial status_log entry"
```

---

### Task 9: Tasks — createFromRequest (called by Plan 2b's work-requests.submit)

**Files:**
- Modify: `lib/services/tasks/index.ts`
- Modify: `lib/services/tasks/schemas.ts`
- Create: `tests/unit/services/tasks/create-from-request.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/tasks/create-from-request.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { createFromRequest } from "@/lib/services/tasks";

describe("tasks.createFromRequest", () => {
  it("creates a task with source='from_request' tied to a request id and project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);

      // Insert a placeholder work_request row first (since the FK is real).
      const [request] = await db
        .insert(schema.workRequests)
        .values({
          orgId: org.id,
          submittedBy: admin.id,
          projectId: project.id,
          title: "Help with X",
          status: "submitted",
        })
        .returning();

      const task = await createFromRequest(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Help with X",
        description: "Customer notes",
        priority: "high",
        sourceRequestId: request!.id,
        createdBy: admin.id,
      });

      expect(task.source).toBe("from_request");
      expect(task.sourceRequestId).toBe(request!.id);
      expect(task.projectId).toBe(project.id);
      expect(task.status).toBe("todo");

      // Status log row inserted.
      const logs = await db
        .select()
        .from(schema.taskStatusLog)
        .where(eq(schema.taskStatusLog.taskId, task.id));
      expect(logs).toHaveLength(1);
      expect(logs[0]!.toStatus).toBe("todo");
    });
  });

  it("supports null projectId (triage queue)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const [request] = await db
        .insert(schema.workRequests)
        .values({
          orgId: org.id,
          submittedBy: admin.id,
          projectId: null,
          title: "General inquiry",
          status: "submitted",
        })
        .returning();

      const task = await createFromRequest(db, {
        orgId: org.id,
        projectId: null,
        title: "General inquiry",
        sourceRequestId: request!.id,
        createdBy: admin.id,
      });

      expect(task.projectId).toBeNull();
      expect(task.source).toBe("from_request");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/tasks/create-from-request.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `lib/services/tasks/index.ts`:

```ts
export type CreateFromRequestInput = {
  orgId: string;
  projectId: string | null;
  title: string;
  description?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  sourceRequestId: string;
  createdBy: string;
};

/**
 * Internal-but-exported helper. Called by work-requests.submit (Plan 2b)
 * inside the same transaction. NOT a public Server Action — there is no
 * OrgContext authorization here because the caller (work-requests.submit)
 * already validated.
 */
export async function createFromRequest(db: AnyDb, input: CreateFromRequestInput): Promise<Task> {
  const [row] = await db
    .insert(schema.tasks)
    .values({
      orgId: input.orgId,
      projectId: input.projectId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "normal",
      customerVisible: true,
      source: "from_request",
      sourceRequestId: input.sourceRequestId,
      createdBy: input.createdBy,
    })
    .returning();
  await logStatusTransition(db, row!.id, null, "todo", input.createdBy);
  return row!;
}
```

- [ ] **Step 4: GREEN + commit**

```bash
pnpm test tests/unit/services/tasks/create-from-request.test.ts
pnpm test
git add lib/services/tasks tests/unit/services/tasks/create-from-request.test.ts
git commit -m "feat(services): tasks.createFromRequest internal helper for work-request flow"
```

---

### Task 10: Tasks — updateTask (title/description/priority/dueDate/customerVisible)

**Files:**
- Modify: `lib/services/tasks/index.ts`
- Modify: `lib/services/tasks/schemas.ts`
- Create: `tests/unit/services/tasks/update.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/tasks/update.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { assignProject, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { updateTask } from "@/lib/services/tasks";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedTask(db: any, orgId: string, projectId: string | null, createdBy: string) {
  const [row] = await db
    .insert(schema.tasks)
    .values({
      orgId,
      projectId,
      title: "Original",
      source: "admin_created" as const,
      createdBy,
    })
    .returning();
  return row;
}

describe("tasks.updateTask", () => {
  it("admin can update title + description + priority + dueDate", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      const r = await updateTask(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        title: "Updated",
        description: "Now with details",
        priority: "urgent",
        dueDate: "2026-09-30",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.title).toBe("Updated");
      expect(r.data.priority).toBe("urgent");
      expect(r.data.dueDate).toBe("2026-09-30");
    });
  });

  it("assigned employee can update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      const r = await updateTask(db, ctxOf(org.id, "employee", employee.id), {
        id: task.id,
        title: "Employee update",
      });
      expect(r.ok).toBe(true);
    });
  });

  it("customer cannot update tasks", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      const r = await updateTask(db, ctxOf(org.id, "customer", customer.id), {
        id: task.id,
        title: "Try",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("does NOT change status (changeStatus is a separate op)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      // updateTask schema does not accept status.
      const r = await updateTask(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        // @ts-expect-error — verifying schema rejects unknown field
        status: "done",
      });
      // Even if status passed through, the update would not include it.
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
pnpm test tests/unit/services/tasks/update.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Schemas**

Append to `lib/services/tasks/schemas.ts`:

```ts
export const updateTaskInputSchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema.max(200).optional(),
    description: z.string().max(10000).nullable().optional(),
    priority: priorityEnum.optional(),
    dueDate: dateSchema.nullable().optional(),
    customerVisible: z.boolean().optional(),
  })
  .strict(); // reject unknown keys (e.g., status — that's a separate op)
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/tasks/index.ts`:

```ts
import { requireTaskWrite } from "@/lib/services/_auth/predicates";
import { updateTaskInputSchema, type UpdateTaskInput } from "./schemas";

export async function updateTask(
  db: AnyDb,
  ctx: OrgContext,
  input: UpdateTaskInput,
): Promise<Result<Task>> {
  const parsed = updateTaskInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const auth = await requireTaskWrite(db, ctx, parsed.data.id);
  if (!auth.ok) return auth;

  const updates: Partial<typeof schema.tasks.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.dueDate !== undefined) updates.dueDate = parsed.data.dueDate;
  if (parsed.data.customerVisible !== undefined) updates.customerVisible = parsed.data.customerVisible;

  const [row] = await db
    .update(schema.tasks)
    .set(updates)
    .where(eq(schema.tasks.id, parsed.data.id))
    .returning();
  return ok(row!);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/tasks/update.test.ts
pnpm test
git add lib/services/tasks tests/unit/services/tasks/update.test.ts
git commit -m "feat(services): tasks.updateTask (no status changes here)"
```

---

### Task 11: Tasks — changeStatus (with status_log + notification emit)

**Files:**
- Modify: `lib/services/tasks/index.ts`
- Modify: `lib/services/tasks/schemas.ts`
- Create: `tests/unit/services/tasks/change-status.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/tasks/change-status.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { changeTaskStatus } from "@/lib/services/tasks";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedTask(db: any, orgId: string, projectId: string, createdBy: string, status: any = "todo") {
  const [row] = await db
    .insert(schema.tasks)
    .values({
      orgId,
      projectId,
      title: "T",
      source: "admin_created" as const,
      createdBy,
      status,
    })
    .returning();
  return row;
}

describe("tasks.changeTaskStatus", () => {
  it("transitions todo -> in_progress and inserts status_log", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id, "todo");
      const r = await changeTaskStatus(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        toStatus: "in_progress",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("in_progress");
      const logs = await db
        .select()
        .from(schema.taskStatusLog)
        .where(eq(schema.taskStatusLog.taskId, task.id));
      // 1 row from seed (none here since seed didn't log) + 1 from this transition.
      expect(logs.filter((l) => l.toStatus === "in_progress")).toHaveLength(1);
    });
  });

  it("transition to 'done' sets completedAt", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id, "in_progress");
      const r = await changeTaskStatus(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        toStatus: "done",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("done");
      expect(r.data.completedAt).not.toBeNull();
    });
  });

  it("re-opening from 'done' clears completedAt", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id, "done");
      // Pre-set completedAt so we can verify it gets cleared.
      await db.update(schema.tasks).set({ completedAt: new Date() }).where(eq(schema.tasks.id, task.id));
      const r = await changeTaskStatus(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        toStatus: "in_progress",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.completedAt).toBeNull();
    });
  });

  it("rejects illegal transitions (e.g., todo -> done direct is allowed; done -> blocked is NOT)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id, "done");
      const r = await changeTaskStatus(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        toStatus: "blocked",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("noop when toStatus equals current status (idempotent ok)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id, "in_progress");
      const r = await changeTaskStatus(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        toStatus: "in_progress",
      });
      expect(r.ok).toBe(true);
      // No new log row.
      const logs = await db
        .select()
        .from(schema.taskStatusLog)
        .where(eq(schema.taskStatusLog.taskId, task.id));
      expect(logs).toHaveLength(0);
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/tasks/change-status.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Schemas + transition map**

Append to `lib/services/tasks/schemas.ts`:

```ts
export const changeTaskStatusInputSchema = z.object({
  id: idSchema,
  toStatus: taskStatusEnum,
  note: z.string().max(500).optional(),
});
export type ChangeTaskStatusInput = z.infer<typeof changeTaskStatusInputSchema>;

// Allowed transitions (per spec §8.8).
export const ALLOWED_TASK_TRANSITIONS: Record<
  z.infer<typeof taskStatusEnum>,
  z.infer<typeof taskStatusEnum>[]
> = {
  todo: ["in_progress", "blocked", "cancelled", "done"],
  in_progress: ["todo", "blocked", "done", "cancelled"],
  blocked: ["todo", "in_progress", "cancelled"],
  done: ["in_progress"],
  cancelled: ["todo"],
};
```

- [ ] **Step 4: Implement**

Append to `lib/services/tasks/index.ts`:

```ts
import { eq, and } from "drizzle-orm";
import { emit } from "@/lib/services/notifications";
import {
  changeTaskStatusInputSchema,
  type ChangeTaskStatusInput,
  ALLOWED_TASK_TRANSITIONS,
} from "./schemas";

export async function changeTaskStatus(
  db: AnyDb,
  ctx: OrgContext,
  input: ChangeTaskStatusInput,
): Promise<Result<Task>> {
  const parsed = changeTaskStatusInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const auth = await requireTaskWrite(db, ctx, parsed.data.id);
  if (!auth.ok) return auth;

  const [task] = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, parsed.data.id))
    .limit(1);
  if (!task) return err("not_found", "Task not found");

  // Idempotent noop.
  if (task.status === parsed.data.toStatus) return ok(task);

  const allowed = ALLOWED_TASK_TRANSITIONS[task.status as keyof typeof ALLOWED_TASK_TRANSITIONS] ?? [];
  if (!allowed.includes(parsed.data.toStatus)) {
    return err("validation", `Cannot transition from ${task.status} to ${parsed.data.toStatus}`, {
      fields: { toStatus: "illegal transition" },
    });
  }

  const updates: Partial<typeof schema.tasks.$inferInsert> = {
    status: parsed.data.toStatus,
    updatedAt: new Date(),
  };
  if (parsed.data.toStatus === "done") updates.completedAt = new Date();
  if (task.status === "done" && parsed.data.toStatus !== "done") updates.completedAt = null;

  const [row] = await db
    .update(schema.tasks)
    .set(updates)
    .where(eq(schema.tasks.id, parsed.data.id))
    .returning();
  await logStatusTransition(db, row!.id, task.status, parsed.data.toStatus, ctx.actor.userId, parsed.data.note);

  // Emit notification: assignees + (if customer-visible) customers in org.
  const assignees = await db
    .select({ userId: schema.taskAssignments.userId })
    .from(schema.taskAssignments)
    .where(eq(schema.taskAssignments.taskId, parsed.data.id));
  const recipientIds = new Set<string>(assignees.map((a) => a.userId));
  if (row!.customerVisible) {
    const customers = await db
      .select({ userId: schema.members.userId })
      .from(schema.members)
      .where(eq(schema.members.organizationId, ctx.orgId));
    customers.forEach((c) => recipientIds.add(c.userId));
  }
  recipientIds.delete(ctx.actor.userId);
  if (recipientIds.size > 0) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "task.status_changed",
      recipientUserIds: Array.from(recipientIds),
      payload: {
        taskId: row!.id,
        title: row!.title,
        from: task.status,
        to: parsed.data.toStatus,
        actorId: ctx.actor.userId,
      },
      relatedType: "task",
      relatedId: row!.id,
    });
  }

  return ok(row!);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/tasks/change-status.test.ts
pnpm test
git add lib/services/tasks tests/unit/services/tasks/change-status.test.ts
git commit -m "feat(services): tasks.changeTaskStatus with transition rules + status_log + notify"
```

---

### Task 12: Tasks — assignTask + unassignTask (with assignment notifications)

**Files:**
- Modify: `lib/services/tasks/index.ts`
- Modify: `lib/services/tasks/schemas.ts`
- Create: `tests/unit/services/tasks/assign.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/tasks/assign.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { assignTask, unassignTask } from "@/lib/services/tasks";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedTask(db: any, orgId: string, projectId: string, createdBy: string) {
  const [row] = await db
    .insert(schema.tasks)
    .values({
      orgId,
      projectId,
      title: "T",
      source: "admin_created" as const,
      createdBy,
    })
    .returning();
  return row;
}

describe("tasks.assignTask", () => {
  it("admin can assign an employee", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      const r = await assignTask(db, ctxOf(org.id, "admin", admin.id), {
        taskId: task.id,
        userId: employee.id,
      });
      expect(r.ok).toBe(true);
      const found = await db
        .select()
        .from(schema.taskAssignments)
        .where(
          and(
            eq(schema.taskAssignments.taskId, task.id),
            eq(schema.taskAssignments.userId, employee.id),
          ),
        );
      expect(found).toHaveLength(1);
      // Notification fired to the new assignee.
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, employee.id));
      expect(notifs).toHaveLength(1);
      expect(notifs[0]!.eventType).toBe("task.assigned");
    });
  });

  it("idempotent on duplicate assign", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      await assignTask(db, ctxOf(org.id, "admin", admin.id), { taskId: task.id, userId: employee.id });
      await assignTask(db, ctxOf(org.id, "admin", admin.id), { taskId: task.id, userId: employee.id });
      const found = await db.select().from(schema.taskAssignments);
      expect(found).toHaveLength(1);
      // Notification fires only the FIRST time.
      const notifs = await db.select().from(schema.notifications);
      expect(notifs).toHaveLength(1);
    });
  });

  it("rejects assigning a customer", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      const r = await assignTask(db, ctxOf(org.id, "admin", admin.id), { taskId: task.id, userId: customer.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });
});

describe("tasks.unassignTask", () => {
  it("removes the assignment without firing a notification", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      await db.insert(schema.taskAssignments).values({ taskId: task.id, userId: employee.id });

      const r = await unassignTask(db, ctxOf(org.id, "admin", admin.id), { taskId: task.id, userId: employee.id });
      expect(r.ok).toBe(true);
      const found = await db.select().from(schema.taskAssignments);
      expect(found).toHaveLength(0);
      const notifs = await db.select().from(schema.notifications);
      expect(notifs).toHaveLength(0); // No notification on remove.
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/tasks/assign.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Schemas**

Append to `lib/services/tasks/schemas.ts`:

```ts
export const taskAssignmentInputSchema = z.object({
  taskId: idSchema,
  userId: idSchema,
});
export type TaskAssignmentInput = z.infer<typeof taskAssignmentInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/tasks/index.ts`:

```ts
import { taskAssignmentInputSchema, type TaskAssignmentInput } from "./schemas";

export async function assignTask(
  db: AnyDb,
  ctx: OrgContext,
  input: TaskAssignmentInput,
): Promise<Result<true>> {
  const parsed = taskAssignmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const auth = await requireTaskWrite(db, ctx, parsed.data.taskId);
  if (!auth.ok) return auth;

  const [user] = await db
    .select({ id: schema.users.id, systemRole: schema.users.systemRole })
    .from(schema.users)
    .where(eq(schema.users.id, parsed.data.userId))
    .limit(1);
  if (!user) return err("not_found", "User not found");
  if (user.systemRole === "customer") {
    return err("validation", "Cannot assign tasks to customers", { fields: { userId: "Customers cannot be assigned" } });
  }

  // Idempotent check — was this user already assigned?
  const [existing] = await db
    .select()
    .from(schema.taskAssignments)
    .where(
      and(
        eq(schema.taskAssignments.taskId, parsed.data.taskId),
        eq(schema.taskAssignments.userId, parsed.data.userId),
      ),
    )
    .limit(1);
  if (existing) return ok(true); // already assigned, no notification

  await db
    .insert(schema.taskAssignments)
    .values({ taskId: parsed.data.taskId, userId: parsed.data.userId });

  // Fetch task title for the notification payload.
  const [task] = await db
    .select({ title: schema.tasks.title })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, parsed.data.taskId))
    .limit(1);

  await emit(db, {
    orgId: ctx.orgId,
    eventType: "task.assigned",
    recipientUserIds: [parsed.data.userId],
    payload: {
      taskId: parsed.data.taskId,
      title: task?.title ?? "(unknown)",
      actorId: ctx.actor.userId,
    },
    relatedType: "task",
    relatedId: parsed.data.taskId,
  });

  return ok(true);
}

export async function unassignTask(
  db: AnyDb,
  ctx: OrgContext,
  input: TaskAssignmentInput,
): Promise<Result<true>> {
  const parsed = taskAssignmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const auth = await requireTaskWrite(db, ctx, parsed.data.taskId);
  if (!auth.ok) return auth;

  await db
    .delete(schema.taskAssignments)
    .where(
      and(
        eq(schema.taskAssignments.taskId, parsed.data.taskId),
        eq(schema.taskAssignments.userId, parsed.data.userId),
      ),
    );
  return ok(true);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/tasks/assign.test.ts
pnpm test
git add lib/services/tasks tests/unit/services/tasks/assign.test.ts
git commit -m "feat(services): tasks.assignTask + unassignTask with assigned notification"
```

---

### Task 13: Tasks — listTasks + getTask

**Files:**
- Modify: `lib/services/tasks/index.ts`
- Modify: `lib/services/tasks/schemas.ts`
- Create: `tests/unit/services/tasks/list.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/tasks/list.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { assignProject, createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { listTasks, getTask } from "@/lib/services/tasks";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedTask(db: any, orgId: string, projectId: string | null, createdBy: string, opts: any = {}) {
  const [row] = await db
    .insert(schema.tasks)
    .values({
      orgId,
      projectId,
      title: opts.title ?? "T",
      source: opts.source ?? "admin_created",
      sourceRequestId: opts.sourceRequestId ?? null,
      createdBy,
      customerVisible: opts.customerVisible ?? true,
      status: opts.status ?? "todo",
    })
    .returning();
  return row;
}

describe("tasks.listTasks", () => {
  it("admin sees all tasks in their org (including triage)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      // Need a real work_request to satisfy the CHECK constraint for from_request tasks.
      const [request] = await db
        .insert(schema.workRequests)
        .values({ orgId: org.id, submittedBy: admin.id, title: "x", status: "submitted" })
        .returning();
      await seedTask(db, org.id, project.id, admin.id, { title: "with project" });
      await seedTask(db, org.id, null, admin.id, { title: "triage", source: "from_request", sourceRequestId: request!.id });
      const r = await listTasks(db, ctxOf(org.id, "admin", admin.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((t) => t.title).sort()).toEqual(["triage", "with project"]);
    });
  });

  it("employee only sees tasks on their assigned projects", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const p1 = await createProject(db, org.id, admin.id);
      const p2 = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, p1.id);
      await seedTask(db, org.id, p1.id, admin.id, { title: "On P1" });
      await seedTask(db, org.id, p2.id, admin.id, { title: "On P2" });
      const r = await listTasks(db, ctxOf(org.id, "employee", employee.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((t) => t.title)).toEqual(["On P1"]);
    });
  });

  it("customer only sees customer_visible tasks with non-null project_id", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const [request] = await db
        .insert(schema.workRequests)
        .values({ orgId: org.id, submittedBy: admin.id, title: "x", status: "submitted" })
        .returning();
      await seedTask(db, org.id, project.id, admin.id, { title: "Visible", customerVisible: true });
      await seedTask(db, org.id, project.id, admin.id, { title: "Internal", customerVisible: false });
      await seedTask(db, org.id, null, admin.id, { title: "Triage", source: "from_request", sourceRequestId: request!.id });
      const r = await listTasks(db, ctxOf(org.id, "customer", customer.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((t) => t.title)).toEqual(["Visible"]);
    });
  });

  it("status + projectId filters narrow the result", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      await seedTask(db, org.id, project.id, admin.id, { title: "TodoT", status: "todo" });
      await seedTask(db, org.id, project.id, admin.id, { title: "DoneT", status: "done" });
      const r = await listTasks(db, ctxOf(org.id, "admin", admin.id), { status: "todo", projectId: project.id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((t) => t.title)).toEqual(["TodoT"]);
    });
  });
});

describe("tasks.getTask", () => {
  it("admin fetches a task", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      const r = await getTask(db, ctxOf(org.id, "admin", admin.id), task.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.id).toBe(task.id);
    });
  });

  it("customer cannot get an internal task", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id, { customerVisible: false });
      const r = await getTask(db, ctxOf(org.id, "customer", customer.id), task.id);
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
pnpm test tests/unit/services/tasks/list.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Schemas**

Append to `lib/services/tasks/schemas.ts`:

```ts
export const listTasksInputSchema = z.object({
  status: taskStatusEnum.optional(),
  projectId: idSchema.optional(),
});
export type ListTasksInput = z.infer<typeof listTasksInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/tasks/index.ts`:

```ts
import { isNotNull } from "drizzle-orm";
import { requireOrgAccess, requireTaskRead } from "@/lib/services/_auth/predicates";
import { listTasksInputSchema, type ListTasksInput } from "./schemas";

export async function listTasks(
  db: AnyDb,
  ctx: OrgContext,
  input: ListTasksInput,
): Promise<Result<Task[]>> {
  const parsed = listTasksInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const access = await requireOrgAccess(db, ctx);
  if (!access.ok) return access;

  const conditions = [eq(schema.tasks.orgId, ctx.orgId)];
  if (parsed.data.status) conditions.push(eq(schema.tasks.status, parsed.data.status));
  if (parsed.data.projectId) conditions.push(eq(schema.tasks.projectId, parsed.data.projectId));

  if (ctx.actor.role === "customer") {
    conditions.push(eq(schema.tasks.customerVisible, true));
    conditions.push(isNotNull(schema.tasks.projectId));
  }

  if (ctx.actor.role === "employee") {
    const assigned = await db
      .select({ projectId: schema.projectAssignments.projectId })
      .from(schema.projectAssignments)
      .where(eq(schema.projectAssignments.userId, ctx.actor.userId));
    const ids = assigned.map((r) => r.projectId);
    if (ids.length === 0) return ok([]);
    conditions.push(inArray(schema.tasks.projectId, ids));
  }

  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(...conditions))
    .orderBy(schema.tasks.createdAt);
  return ok(rows);
}

export async function getTask(
  db: AnyDb,
  ctx: OrgContext,
  taskId: string,
): Promise<Result<Task>> {
  const access = await requireTaskRead(db, ctx, taskId);
  if (!access.ok) return access;
  const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1);
  if (!row) return err("not_found", "Task not found");
  return ok(row);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/tasks/list.test.ts
pnpm test
git add lib/services/tasks tests/unit/services/tasks/list.test.ts
git commit -m "feat(services): tasks.listTasks + getTask with role-scoped visibility"
```

---

### Task 14: Time entries — logTime (with rate resolution)

**Files:**
- Create: `lib/services/time-entries/index.ts`
- Create: `lib/services/time-entries/internal.ts`
- Create: `lib/services/time-entries/schemas.ts`
- Create: `tests/unit/services/time-entries/log.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/time-entries/log.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { assignProject, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { logTime } from "@/lib/services/time-entries";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedTask(db: any, orgId: string, projectId: string | null, createdBy: string) {
  const [row] = await db
    .insert(schema.tasks)
    .values({ orgId, projectId, title: "T", source: "admin_created", createdBy })
    .returning();
  return row;
}

describe("time-entries.logTime", () => {
  it("employee logs time on a task they're assigned to via project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee", defaultHourlyRateCents: 15000 });
      const project = await createProject(db, org.id, admin.id, { hourlyRateCents: 25000 });
      await assignProject(db, employee.id, project.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      const r = await logTime(db, ctxOf(org.id, "employee", employee.id), {
        taskId: task.id,
        minutes: 90,
        loggedForDate: "2026-05-08",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.minutes).toBe(90);
      // Project rate (25000) takes precedence over user default (15000).
      expect(r.data.rateCentsPerHour).toBe(25000);
      expect(r.data.projectId).toBe(project.id);
    });
  });

  it("falls back to user default rate when project has no rate", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee", defaultHourlyRateCents: 12000 });
      const project = await createProject(db, org.id, admin.id, { hourlyRateCents: null });
      await assignProject(db, employee.id, project.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      const r = await logTime(db, ctxOf(org.id, "employee", employee.id), {
        taskId: task.id,
        minutes: 30,
        loggedForDate: "2026-05-08",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.rateCentsPerHour).toBe(12000);
    });
  });

  it("rate is null when neither project nor user has a rate", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      const r = await logTime(db, ctxOf(org.id, "employee", employee.id), {
        taskId: task.id,
        minutes: 60,
        loggedForDate: "2026-05-08",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.rateCentsPerHour).toBeNull();
    });
  });

  it("rejects logging time on a task with null projectId (triage)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const [request] = await db
        .insert(schema.workRequests)
        .values({ orgId: org.id, submittedBy: admin.id, title: "x", status: "submitted" })
        .returning();
      const [task] = await db
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: null,
          title: "Triage T",
          source: "from_request" as const,
          sourceRequestId: request!.id,
          createdBy: admin.id,
        })
        .returning();
      const r = await logTime(db, ctxOf(org.id, "admin", admin.id), {
        taskId: task!.id,
        minutes: 60,
        loggedForDate: "2026-05-08",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("rejects zero or negative minutes", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      const r = await logTime(db, ctxOf(org.id, "admin", admin.id), {
        taskId: task.id,
        minutes: 0,
        loggedForDate: "2026-05-08",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("customer cannot log time", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      const project = await createProject(db, org.id, admin.id);
      const task = await seedTask(db, org.id, project.id, admin.id);
      const r = await logTime(db, ctxOf(org.id, "customer", customer.id), {
        taskId: task.id,
        minutes: 60,
        loggedForDate: "2026-05-08",
      });
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
pnpm test tests/unit/services/time-entries/log.test.ts
```

- [ ] **Step 3: Schemas**

Create `lib/services/time-entries/schemas.ts`:

```ts
import { z } from "zod";
import { dateSchema, idSchema, positiveIntSchema } from "@/lib/services/_schemas/common";

export const logTimeInputSchema = z.object({
  taskId: idSchema,
  minutes: positiveIntSchema,
  loggedForDate: dateSchema,
  note: z.string().max(2000).optional(),
});
export type LogTimeInput = z.infer<typeof logTimeInputSchema>;
```

- [ ] **Step 4: Internal helper**

Create `lib/services/time-entries/internal.ts`:

```ts
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

type AnyDb = PgDatabase<any, typeof schema>;

export async function resolveRate(
  db: AnyDb,
  projectId: string,
  userId: string,
): Promise<number | null> {
  const [project] = await db
    .select({ rate: schema.projects.hourlyRateCents })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (project?.rate != null) return project.rate;

  const [user] = await db
    .select({ rate: schema.users.defaultHourlyRateCents })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return user?.rate ?? null;
}
```

- [ ] **Step 5: Implement**

Create `lib/services/time-entries/index.ts`:

```ts
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireProjectAccess } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { logTimeInputSchema, type LogTimeInput } from "./schemas";
import { resolveRate } from "./internal";

type AnyDb = PgDatabase<any, typeof schema>;
type TimeEntry = typeof schema.timeEntries.$inferSelect;

function zodIssuesToFields(issues: { path: (string | number)[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function logTime(
  db: AnyDb,
  ctx: OrgContext,
  input: LogTimeInput,
): Promise<Result<TimeEntry>> {
  const parsed = logTimeInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  if (ctx.actor.role === "customer") return err("unauthorized", "Customers cannot log time");

  const [task] = await db
    .select({ id: schema.tasks.id, orgId: schema.tasks.orgId, projectId: schema.tasks.projectId })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, parsed.data.taskId))
    .limit(1);
  if (!task) return err("not_found", "Task not found");
  if (task.orgId !== ctx.orgId) return err("not_found", "Task not found");
  if (!task.projectId) {
    return err("validation", "Task is in triage queue (no project)", {
      fields: { taskId: "Task has no project — admin must accept the request first" },
    });
  }

  const access = await requireProjectAccess(db, ctx, task.projectId);
  if (!access.ok) return access;

  const rate = await resolveRate(db, task.projectId, ctx.actor.userId);

  const [row] = await db
    .insert(schema.timeEntries)
    .values({
      orgId: ctx.orgId,
      projectId: task.projectId,
      taskId: task.id,
      userId: ctx.actor.userId,
      minutes: parsed.data.minutes,
      loggedForDate: parsed.data.loggedForDate,
      note: parsed.data.note ?? null,
      rateCentsPerHour: rate,
    })
    .returning();
  return ok(row!);
}
```

- [ ] **Step 6: GREEN + commit**

```bash
pnpm test tests/unit/services/time-entries/log.test.ts
pnpm test
git add lib/services/time-entries tests/unit/services/time-entries/log.test.ts
git commit -m "feat(services): time-entries.logTime with rate resolution (project > user > null)"
```

---

### Task 15: Time entries — listTimeEntries

**Files:**
- Modify: `lib/services/time-entries/index.ts`
- Modify: `lib/services/time-entries/schemas.ts`
- Create: `tests/unit/services/time-entries/list.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/unit/services/time-entries/list.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { assignProject, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { listTimeEntries } from "@/lib/services/time-entries";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedEntry(db: any, orgId: string, projectId: string, taskId: string, userId: string, opts: any = {}) {
  const [row] = await db
    .insert(schema.timeEntries)
    .values({
      orgId,
      projectId,
      taskId,
      userId,
      minutes: opts.minutes ?? 60,
      loggedForDate: opts.loggedForDate ?? "2026-05-08",
      rateCentsPerHour: opts.rateCentsPerHour ?? null,
    })
    .returning();
  return row;
}

describe("time-entries.listTimeEntries", () => {
  it("admin sees all entries in their org", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [task] = await db
        .insert(schema.tasks)
        .values({ orgId: org.id, projectId: project.id, title: "T", source: "admin_created", createdBy: admin.id })
        .returning();
      await seedEntry(db, org.id, project.id, task!.id, employee.id);
      await seedEntry(db, org.id, project.id, task!.id, admin.id);
      const r = await listTimeEntries(db, ctxOf(org.id, "admin", admin.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(2);
    });
  });

  it("employee only sees entries for projects they're assigned to", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const p1 = await createProject(db, org.id, admin.id);
      const p2 = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, p1.id);
      const [t1] = await db.insert(schema.tasks).values({ orgId: org.id, projectId: p1.id, title: "T1", source: "admin_created", createdBy: admin.id }).returning();
      const [t2] = await db.insert(schema.tasks).values({ orgId: org.id, projectId: p2.id, title: "T2", source: "admin_created", createdBy: admin.id }).returning();
      await seedEntry(db, org.id, p1.id, t1!.id, admin.id);
      await seedEntry(db, org.id, p2.id, t2!.id, admin.id);
      const r = await listTimeEntries(db, ctxOf(org.id, "employee", employee.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(1);
      expect(r.data[0]!.projectId).toBe(p1.id);
    });
  });

  it("customer cannot list time entries (unauthorized)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      const r = await listTimeEntries(db, ctxOf(org.id, "customer", customer.id), {});
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("filters: projectId + dateRange", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const [task] = await db.insert(schema.tasks).values({ orgId: org.id, projectId: project.id, title: "T", source: "admin_created", createdBy: admin.id }).returning();
      await seedEntry(db, org.id, project.id, task!.id, admin.id, { loggedForDate: "2026-05-01" });
      await seedEntry(db, org.id, project.id, task!.id, admin.id, { loggedForDate: "2026-05-08" });
      await seedEntry(db, org.id, project.id, task!.id, admin.id, { loggedForDate: "2026-05-15" });
      const r = await listTimeEntries(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        fromDate: "2026-05-05",
        toDate: "2026-05-10",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(1);
      expect(r.data[0]!.loggedForDate).toBe("2026-05-08");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/time-entries/list.test.ts
```

- [ ] **Step 3: Schemas**

Append to `lib/services/time-entries/schemas.ts`:

```ts
export const listTimeEntriesInputSchema = z.object({
  projectId: idSchema.optional(),
  taskId: idSchema.optional(),
  userId: idSchema.optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
});
export type ListTimeEntriesInput = z.infer<typeof listTimeEntriesInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/time-entries/index.ts`:

```ts
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { listTimeEntriesInputSchema, type ListTimeEntriesInput } from "./schemas";

export async function listTimeEntries(
  db: AnyDb,
  ctx: OrgContext,
  input: ListTimeEntriesInput,
): Promise<Result<TimeEntry[]>> {
  const parsed = listTimeEntriesInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  if (ctx.actor.role === "customer") return err("unauthorized", "Customers cannot view time entries");

  const conditions = [eq(schema.timeEntries.orgId, ctx.orgId)];
  if (parsed.data.projectId) conditions.push(eq(schema.timeEntries.projectId, parsed.data.projectId));
  if (parsed.data.taskId) conditions.push(eq(schema.timeEntries.taskId, parsed.data.taskId));
  if (parsed.data.userId) conditions.push(eq(schema.timeEntries.userId, parsed.data.userId));
  if (parsed.data.fromDate) conditions.push(gte(schema.timeEntries.loggedForDate, parsed.data.fromDate));
  if (parsed.data.toDate) conditions.push(lte(schema.timeEntries.loggedForDate, parsed.data.toDate));

  if (ctx.actor.role === "employee") {
    const assigned = await db
      .select({ projectId: schema.projectAssignments.projectId })
      .from(schema.projectAssignments)
      .where(eq(schema.projectAssignments.userId, ctx.actor.userId));
    const ids = assigned.map((r) => r.projectId);
    if (ids.length === 0) return ok([]);
    conditions.push(inArray(schema.timeEntries.projectId, ids));
  }

  const rows = await db
    .select()
    .from(schema.timeEntries)
    .where(and(...conditions))
    .orderBy(schema.timeEntries.loggedForDate, schema.timeEntries.createdAt);
  return ok(rows);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/time-entries/list.test.ts
pnpm test
git add lib/services/time-entries tests/unit/services/time-entries/list.test.ts
git commit -m "feat(services): time-entries.listTimeEntries with role-scoped + filter support"
```

---

### Task 16: Time entries — updateTimeEntry + deleteTimeEntry

**Files:**
- Modify: `lib/services/time-entries/index.ts`
- Modify: `lib/services/time-entries/schemas.ts`
- Create: `tests/unit/services/time-entries/update.test.ts`
- Create: `tests/unit/services/time-entries/delete.test.ts`

- [ ] **Step 1: Failing tests**

Create `tests/unit/services/time-entries/update.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { updateTimeEntry } from "@/lib/services/time-entries";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedEntry(db: any, orgId: string, projectId: string, taskId: string, userId: string) {
  const [row] = await db
    .insert(schema.timeEntries)
    .values({ orgId, projectId, taskId, userId, minutes: 60, loggedForDate: "2026-05-08" })
    .returning();
  return row;
}

describe("time-entries.updateTimeEntry", () => {
  it("owner can update minutes + note", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [task] = await db.insert(schema.tasks).values({ orgId: org.id, projectId: project.id, title: "T", source: "admin_created", createdBy: admin.id }).returning();
      const entry = await seedEntry(db, org.id, project.id, task!.id, employee.id);

      const r = await updateTimeEntry(db, ctxOf(org.id, "employee", employee.id), {
        id: entry.id,
        minutes: 90,
        note: "Took longer than expected",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.minutes).toBe(90);
      expect(r.data.note).toBe("Took longer than expected");
    });
  });

  it("admin can update any entry", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [task] = await db.insert(schema.tasks).values({ orgId: org.id, projectId: project.id, title: "T", source: "admin_created", createdBy: admin.id }).returning();
      const entry = await seedEntry(db, org.id, project.id, task!.id, employee.id);
      const r = await updateTimeEntry(db, ctxOf(org.id, "admin", admin.id), { id: entry.id, minutes: 30 });
      expect(r.ok).toBe(true);
    });
  });

  it("non-owner non-admin cannot update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const owner = await createUser(db, { role: "employee" });
      const other = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [task] = await db.insert(schema.tasks).values({ orgId: org.id, projectId: project.id, title: "T", source: "admin_created", createdBy: admin.id }).returning();
      const entry = await seedEntry(db, org.id, project.id, task!.id, owner.id);
      const r = await updateTimeEntry(db, ctxOf(org.id, "employee", other.id), { id: entry.id, minutes: 1 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

Create `tests/unit/services/time-entries/delete.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { deleteTimeEntry } from "@/lib/services/time-entries";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedEntry(db: any, orgId: string, projectId: string, taskId: string, userId: string) {
  const [row] = await db
    .insert(schema.timeEntries)
    .values({ orgId, projectId, taskId, userId, minutes: 60, loggedForDate: "2026-05-08" })
    .returning();
  return row;
}

describe("time-entries.deleteTimeEntry", () => {
  it("owner can delete", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const owner = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [task] = await db.insert(schema.tasks).values({ orgId: org.id, projectId: project.id, title: "T", source: "admin_created", createdBy: admin.id }).returning();
      const entry = await seedEntry(db, org.id, project.id, task!.id, owner.id);
      const r = await deleteTimeEntry(db, ctxOf(org.id, "employee", owner.id), { id: entry.id });
      expect(r.ok).toBe(true);
      const found = await db.select().from(schema.timeEntries).where(eq(schema.timeEntries.id, entry.id));
      expect(found).toHaveLength(0);
    });
  });

  it("not_found if entry is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const [task] = await db.insert(schema.tasks).values({ orgId: orgB.id, projectId: project.id, title: "T", source: "admin_created", createdBy: admin.id }).returning();
      const entry = await seedEntry(db, orgB.id, project.id, task!.id, admin.id);
      const r = await deleteTimeEntry(db, ctxOf(orgA.id, "admin", admin.id), { id: entry.id });
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
pnpm test tests/unit/services/time-entries/update.test.ts tests/unit/services/time-entries/delete.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Schemas**

Append to `lib/services/time-entries/schemas.ts`:

```ts
export const updateTimeEntryInputSchema = z
  .object({
    id: idSchema,
    minutes: positiveIntSchema.optional(),
    loggedForDate: dateSchema.optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .strict();
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntryInputSchema>;

export const deleteTimeEntryInputSchema = z.object({ id: idSchema });
export type DeleteTimeEntryInput = z.infer<typeof deleteTimeEntryInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/time-entries/index.ts`:

```ts
import {
  updateTimeEntryInputSchema,
  type UpdateTimeEntryInput,
  deleteTimeEntryInputSchema,
  type DeleteTimeEntryInput,
} from "./schemas";

export async function updateTimeEntry(
  db: AnyDb,
  ctx: OrgContext,
  input: UpdateTimeEntryInput,
): Promise<Result<TimeEntry>> {
  const parsed = updateTimeEntryInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  if (ctx.actor.role === "customer") return err("unauthorized", "Customers cannot update time entries");

  const [entry] = await db
    .select()
    .from(schema.timeEntries)
    .where(eq(schema.timeEntries.id, parsed.data.id))
    .limit(1);
  if (!entry) return err("not_found", "Time entry not found");
  if (entry.orgId !== ctx.orgId) return err("not_found", "Time entry not found");

  // Owner OR admin.
  if (ctx.actor.role !== "admin" && entry.userId !== ctx.actor.userId) {
    return err("unauthorized", "Only the owner or an admin can update this entry");
  }

  const updates: Partial<typeof schema.timeEntries.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.minutes !== undefined) updates.minutes = parsed.data.minutes;
  if (parsed.data.loggedForDate !== undefined) updates.loggedForDate = parsed.data.loggedForDate;
  if (parsed.data.note !== undefined) updates.note = parsed.data.note;

  const [row] = await db
    .update(schema.timeEntries)
    .set(updates)
    .where(eq(schema.timeEntries.id, parsed.data.id))
    .returning();
  return ok(row!);
}

export async function deleteTimeEntry(
  db: AnyDb,
  ctx: OrgContext,
  input: DeleteTimeEntryInput,
): Promise<Result<true>> {
  const parsed = deleteTimeEntryInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  if (ctx.actor.role === "customer") return err("unauthorized", "Customers cannot delete time entries");

  const [entry] = await db
    .select()
    .from(schema.timeEntries)
    .where(eq(schema.timeEntries.id, parsed.data.id))
    .limit(1);
  if (!entry) return err("not_found", "Time entry not found");
  if (entry.orgId !== ctx.orgId) return err("not_found", "Time entry not found");

  if (ctx.actor.role !== "admin" && entry.userId !== ctx.actor.userId) {
    return err("unauthorized", "Only the owner or an admin can delete this entry");
  }

  await db.delete(schema.timeEntries).where(eq(schema.timeEntries.id, parsed.data.id));
  return ok(true);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/time-entries/update.test.ts tests/unit/services/time-entries/delete.test.ts
pnpm test
git add lib/services/time-entries tests/unit/services/time-entries/update.test.ts tests/unit/services/time-entries/delete.test.ts
git commit -m "feat(services): time-entries.updateTimeEntry + deleteTimeEntry (owner or admin)"
```

---

### Task 17: Final verification + branch wrap

**Files:**
- None (verification + commit message)

- [ ] **Step 1: Run the full test suite**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all clean. Test count should be ~50+ tests across the project (21 from Plan 1 + ~30 added by Plan 2a).

- [ ] **Step 2: Confirm no orphan files / staged-but-uncommitted changes**

```bash
git status
```
Expected: working tree clean.

- [ ] **Step 3: Confirm the export shape per service**

```bash
node --env-file=.env -e "import('./lib/services/projects/index.ts').then(m => console.log(Object.keys(m)))"
node --env-file=.env -e "import('./lib/services/tasks/index.ts').then(m => console.log(Object.keys(m)))"
node --env-file=.env -e "import('./lib/services/time-entries/index.ts').then(m => console.log(Object.keys(m)))"
node --env-file=.env -e "import('./lib/services/notifications/index.ts').then(m => console.log(Object.keys(m)))"
```

Expected exports (each line):
- projects: `createProject`, `updateProject`, `listProjects`, `getProject`, `assignToProject`, `unassignFromProject`
- tasks: `createTask`, `createFromRequest`, `updateTask`, `changeTaskStatus`, `assignTask`, `unassignTask`, `listTasks`, `getTask`
- time-entries: `logTime`, `listTimeEntries`, `updateTimeEntry`, `deleteTimeEntry`
- notifications: `emit`

If any export is missing or extra, that's a plan failure — fix in the relevant index file.

- [ ] **Step 4: Hand off**

The branch `feat/phase-1-services-work-tracking` is ready for review and merge into `main`. Plan 2b (narrative + intake services) follows.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-05-08-marketing-crm-phase-1-design.md`):

- §7 Service layer organization — `projects/`, `tasks/`, `time-entries/`, `notifications/` modules created with `index.ts` / `internal.ts` / `schemas.ts` per spec ✓
- §7.2 Public function contract — every function takes `(ctx, input) => Promise<Result<T, AppError>>`, validates with Zod, calls predicate, queries with `org_id` scoping ✓
- §6 Schema usage — projects + project_assignments + tasks + task_assignments + task_status_log + time_entries all exercised ✓
- §8.8 Task status transitions — implemented per the allowed-transitions matrix ✓
- §8.9 Task assignment — fan-out notification via `task.assigned` ✓
- §8.10 Time entry logging — rate resolution (project → user → null), task_id required (rejects null project_id), no edit history ✓
- §9.1 Notifications — `task.assigned` and `task.status_changed` emitted from the right call sites ✓
- §9.2 Preferences — `resolvePreferences` honors user override → org default → fallback true ✓
- §9.3 Delivery — synchronous in-app insert; email deferred to Plan 4 ✓

**Out of scope (intentionally) for this plan:**
- Daily updates, comments, work requests → Plan 2b
- Attachments, full notifications API (list/markRead), invitation flows → Plan 2c
- Email delivery via Resend → Plan 4
- Server Actions / UI → Plan 3+

**Placeholder scan:** None. Every step has full code.

**Type consistency:**
- `OrgContext` is the same type imported across all task tests
- `requireRole`, `requireOrgAccess`, `requireProjectAccess`, `requireTaskRead`, `requireTaskWrite` predicates match across services
- `emit()` signature is consistent in `tasks.changeTaskStatus`, `tasks.assignTask`
- `Result<T, AppError>` is the return type everywhere
- `AnyDb` type alias is duplicated in each service file but always uses `PgDatabase<any, typeof schema>` consistently

**Gap notes:**
- `AnyDb` is duplicated across files. A future cleanup task could pull it into a shared type. Not blocking.
- `zodIssuesToFields` is also duplicated. Same comment.
- The `emit()` function does NOT yet schedule email delivery; deferred to Plan 4 with a noop today.
