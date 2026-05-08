import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireRole, requireTaskWrite } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { createTaskInputSchema, type CreateTaskInput, updateTaskInputSchema, type UpdateTaskInput } from "./schemas";
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
 * inside the same transaction. NOT a public Server Action — the caller
 * already authorized.
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
