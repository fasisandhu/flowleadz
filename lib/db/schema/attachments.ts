import { pgTable, uuid, text, timestamp, bigint, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, users } from "./better-auth";

export const attachmentParentTypeEnum = pgEnum("attachment_parent_type", [
  "daily_update",
  "work_request",
  "task",
  "comment",
  "user_avatar",
]);

export const attachmentStatusEnum = pgEnum("attachment_status", ["pending", "ready", "failed"]);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: text("org_id").notNull().references(() => organizations.id),
    parentType: attachmentParentTypeEnum("parent_type").notNull(),
    parentId: text("parent_id").notNull(),
    uploadedBy: text("uploaded_by").notNull().references(() => users.id),
    r2Key: text("r2_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    status: attachmentStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => ({
    byParent: index("attachments_parent_idx").on(t.parentType, t.parentId),
    pendingGc: index("attachments_pending_idx").on(t.status, t.createdAt).where(sql`${t.status} = 'pending'`),
    r2KeyUnique: uniqueIndex("attachments_r2_key_unique").on(t.r2Key),
  }),
);
