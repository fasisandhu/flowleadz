import { and, desc, eq, inArray } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireProjectAccess, requireOrgAccess, requireDailyUpdateRead } from "@/lib/services/_auth/predicates";
import { emit } from "@/lib/services/notifications";
import type { OrgContext } from "@/lib/services/_context";
import { captureRevision } from "./internal";
import {
  createDailyUpdateInputSchema,
  type CreateDailyUpdateInput,
  updateDailyUpdateInputSchema,
  type UpdateDailyUpdateInput,
  listDailyUpdatesInputSchema,
  type ListDailyUpdatesInput,
} from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  if (ctx.actor.role !== "admin" && existing.userId !== ctx.actor.userId) {
    return err("unauthorized", "Only the author or an admin can edit this update");
  }

  const noopBody = parsed.data.body === undefined || parsed.data.body === existing.body;
  const noopActivity =
    parsed.data.activityType === undefined || parsed.data.activityType === existing.activityType;
  const noopVisibility =
    parsed.data.visibility === undefined || parsed.data.visibility === existing.visibility;
  if (noopBody && noopActivity && noopVisibility) {
    return ok(existing);
  }

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
