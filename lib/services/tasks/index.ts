import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireRole } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { createTaskInputSchema, type CreateTaskInput } from "./schemas";
import { logStatusTransition } from "./internal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;
type Task = typeof schema.tasks.$inferSelect;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
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

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

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
