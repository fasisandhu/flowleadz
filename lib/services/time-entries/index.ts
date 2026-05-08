import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireProjectAccess } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { logTimeInputSchema, type LogTimeInput, listTimeEntriesInputSchema, type ListTimeEntriesInput } from "./schemas";
import { resolveRate } from "./internal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;
type TimeEntry = typeof schema.timeEntries.$inferSelect;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
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
