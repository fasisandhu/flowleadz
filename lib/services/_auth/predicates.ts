import { and, eq } from "drizzle-orm";
import { type PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import type { AnyContext, OrgContext, SystemRole } from "@/lib/services/_context";

// AnyDb accepts any PG-dialect Drizzle instance: NeonHttpDatabase (production),
// NodePgDatabase (tests), etc. — they all extend PgDatabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export async function requireOrgAccess(db: AnyDb, ctx: OrgContext): Promise<Result<true>> {
  if (ctx.actor.role !== "customer") return ok(true);
  const rows = await db
    .select({ id: schema.members.id })
    .from(schema.members)
    .where(and(eq(schema.members.userId, ctx.actor.userId), eq(schema.members.organizationId, ctx.orgId)))
    .limit(1);
  if (rows.length === 0) return err("unauthorized", "Not a member of this organization");
  return ok(true);
}

export async function requireProjectAccess(
  db: AnyDb,
  ctx: OrgContext,
  projectId: string,
): Promise<Result<true>> {
  const [project] = await db
    .select({ id: schema.projects.id, orgId: schema.projects.orgId })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!project) return err("not_found", "Project not found");
  if (project.orgId !== ctx.orgId) return err("not_found", "Project not found");

  if (ctx.actor.role === "admin") return ok(true);

  if (ctx.actor.role === "customer") {
    return requireOrgAccess(db, ctx);
  }

  // employee
  const assigned = await db
    .select({ projectId: schema.projectAssignments.projectId })
    .from(schema.projectAssignments)
    .where(
      and(
        eq(schema.projectAssignments.userId, ctx.actor.userId),
        eq(schema.projectAssignments.projectId, projectId),
      ),
    )
    .limit(1);
  if (assigned.length === 0) return err("unauthorized", "Not assigned to this project");
  return ok(true);
}

export function requireRole(ctx: AnyContext, role: SystemRole): Result<true> {
  if (ctx.actor.role !== role) return err("unauthorized", `Requires ${role} role`);
  return ok(true);
}

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
