import { pgTable, uuid, text, timestamp, integer, date, pgEnum, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, users } from "./better-auth";

export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
]);

export const serviceTypeEnum = pgEnum("service_type", [
  "seo",
  "paid_ads",
  "social",
  "content",
  "web",
  "other",
]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: text("org_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    status: projectStatusEnum("status").notNull().default("draft"),
    serviceType: serviceTypeEnum("service_type").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    hourlyRateCents: integer("hourly_rate_cents"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({
    byOrgStatus: index("projects_org_status_idx").on(t.orgId, t.status),
  }),
);

export const projectAssignments = pgTable(
  "project_assignments",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.projectId] }),
    byProject: index("project_assignments_project_idx").on(t.projectId),
  }),
);
