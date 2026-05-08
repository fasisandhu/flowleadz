import { pgTable, uuid, text, timestamp, boolean, date, pgEnum, index, primaryKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, users } from "./better-auth";
import { projects } from "./projects";

export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]);

export const priorityEnum = pgEnum("priority", ["low", "normal", "high", "urgent"]);

export const taskSourceEnum = pgEnum("task_source", ["admin_created", "from_request"]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: text("org_id").notNull().references(() => organizations.id),
    projectId: uuid("project_id").references(() => projects.id),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: priorityEnum("priority").notNull().default("normal"),
    dueDate: date("due_date"),
    customerVisible: boolean("customer_visible").notNull().default(true),
    source: taskSourceEnum("source").notNull(),
    sourceRequestId: uuid("source_request_id"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    byOrgProjectStatus: index("tasks_org_project_status_idx").on(t.orgId, t.projectId, t.status),
    byActiveDueDate: index("tasks_org_status_due_date_idx")
      .on(t.orgId, t.status, t.dueDate)
      .where(sql`${t.status} in ('todo','in_progress','blocked')`),
    triageQueue: index("tasks_triage_idx")
      .on(t.orgId, t.status)
      .where(sql`${t.source} = 'from_request' AND ${t.projectId} IS NULL`),
    sourceConsistency: check(
      "tasks_source_consistency",
      sql`(${t.source} = 'admin_created' AND ${t.sourceRequestId} IS NULL AND ${t.projectId} IS NOT NULL)
          OR
          (${t.source} = 'from_request' AND ${t.sourceRequestId} IS NOT NULL)`,
    ),
  }),
);

export const taskAssignments = pgTable(
  "task_assignments",
  {
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.taskId, t.userId] }),
    byUser: index("task_assignments_user_idx").on(t.userId),
  }),
);

export const taskStatusLog = pgTable(
  "task_status_log",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedBy: text("changed_by").notNull().references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().default(sql`now()`),
    note: text("note"),
  },
  (t) => ({
    byTask: index("task_status_log_task_idx").on(t.taskId, t.changedAt),
  }),
);
