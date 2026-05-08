import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireRole } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { createProjectInputSchema, type CreateProjectInput } from "./schemas";

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
