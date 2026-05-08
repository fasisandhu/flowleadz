import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, users } from "./better-auth";
import { dailyUpdates } from "./daily-updates";

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: text("org_id").notNull().references(() => organizations.id),
    dailyUpdateId: uuid("daily_update_id").notNull().references(() => dailyUpdates.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    byUpdate: index("comments_update_idx").on(t.dailyUpdateId, t.createdAt),
  }),
);

export const commentRevisions = pgTable("comment_revisions", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  commentId: uuid("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  editedBy: text("edited_by").notNull().references(() => users.id),
  editedAt: timestamp("edited_at", { withTimezone: true }).notNull().default(sql`now()`),
});
