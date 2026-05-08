import { pgTable, uuid, text, timestamp, integer, date, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, users } from "./better-auth";
import { projects } from "./projects";
import { tasks } from "./tasks";

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: text("org_id").notNull().references(() => organizations.id),
    projectId: uuid("project_id").notNull().references(() => projects.id),
    taskId: uuid("task_id").notNull().references(() => tasks.id),
    userId: text("user_id").notNull().references(() => users.id),
    minutes: integer("minutes").notNull(),
    loggedForDate: date("logged_for_date").notNull(),
    note: text("note"),
    rateCentsPerHour: integer("rate_cents_per_hour"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    byOrgDate: index("time_entries_org_date_idx").on(t.orgId, t.loggedForDate),
    byProjectUserDate: index("time_entries_project_user_date_idx").on(t.projectId, t.userId, t.loggedForDate),
    minutesPositive: check("time_entries_minutes_positive", sql`${t.minutes} > 0`),
  }),
);
