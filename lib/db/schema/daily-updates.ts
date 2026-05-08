import { pgTable, uuid, text, timestamp, date, pgEnum, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, users } from "./better-auth";
import { projects } from "./projects";
import { tasks } from "./tasks";

export const activityTypeEnum = pgEnum("activity_type", [
  "planning",
  "execution",
  "review",
  "meeting",
  "admin",
  "other",
]);

export const updateVisibilityEnum = pgEnum("update_visibility", [
  "customer_visible",
  "internal_only",
]);

export const dailyUpdates = pgTable(
  "daily_updates",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: text("org_id").notNull().references(() => organizations.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    userId: text("user_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    activityType: activityTypeEnum("activity_type").notNull(),
    visibility: updateVisibilityEnum("visibility").notNull().default("customer_visible"),
    logDate: date("log_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    byOrgProjectDate: index("daily_updates_org_project_date_idx").on(t.orgId, t.projectId, sql`${t.logDate} desc`),
    byOrgDateCustomerVisible: index("daily_updates_org_date_customer_idx")
      .on(t.orgId, sql`${t.logDate} desc`)
      .where(sql`${t.visibility} = 'customer_visible'`),
  }),
);

export const dailyUpdateTasks = pgTable(
  "daily_update_tasks",
  {
    dailyUpdateId: uuid("daily_update_id").notNull().references(() => dailyUpdates.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.dailyUpdateId, t.taskId] }) }),
);

export const dailyUpdateRevisions = pgTable(
  "daily_update_revisions",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    dailyUpdateId: uuid("daily_update_id").notNull().references(() => dailyUpdates.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    activityType: text("activity_type").notNull(),
    visibility: text("visibility").notNull(),
    editedBy: text("edited_by").notNull().references(() => users.id),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    byUpdate: index("daily_update_revisions_update_idx").on(t.dailyUpdateId, sql`${t.editedAt} desc`),
  }),
);
