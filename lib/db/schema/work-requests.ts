import { pgTable, uuid, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, users } from "./better-auth";
import { projects } from "./projects";
import { priorityEnum } from "./tasks";

export const workRequestStatusEnum = pgEnum("work_request_status", [
  "submitted",
  "accepted",
  "rejected",
  "duplicate",
]);

export const workRequests = pgTable(
  "work_requests",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: text("org_id").notNull().references(() => organizations.id),
    submittedBy: text("submitted_by").notNull().references(() => users.id),
    projectId: uuid("project_id").references(() => projects.id),
    title: text("title").notNull(),
    description: text("description"),
    priorityHint: priorityEnum("priority_hint").notNull().default("normal"),
    status: workRequestStatusEnum("status").notNull().default("submitted"),
    rejectionReason: text("rejection_reason"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    resolvedTaskId: uuid("resolved_task_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    byOrgStatusCreated: index("work_requests_org_status_idx").on(t.orgId, t.status, t.createdAt),
  }),
);

export const workRequestStatusLog = pgTable(
  "work_request_status_log",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    workRequestId: uuid("work_request_id").notNull().references(() => workRequests.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedBy: text("changed_by").notNull().references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().default(sql`now()`),
    note: text("note"),
  },
);
