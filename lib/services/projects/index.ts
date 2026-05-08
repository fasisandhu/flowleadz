import type { PgDatabase } from "drizzle-orm/pg-core";
import { and, eq, inArray, ne } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireOrgAccess, requireProjectAccess, requireRole } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { createProjectInputSchema, type CreateProjectInput, updateProjectInputSchema, type UpdateProjectInput, listProjectsInputSchema, type ListProjectsInput } from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;
type Project = typeof schema.projects.$inferSelect;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
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
    conditions.push(ne(schema.projects.status, "draft"));
  }

  if (ctx.actor.role === "employee") {
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

  if (ctx.actor.role === "customer" && row.status === "draft") {
    return err("not_found", "Project not found");
  }
  return ok(row);
}
