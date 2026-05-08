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
