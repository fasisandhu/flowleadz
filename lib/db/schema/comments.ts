import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./better-auth";

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    parentType: text("parent_type").notNull(), // 'daily_update' | 'task'
    parentId: uuid("parent_id").notNull(),      // FK not declared because of polymorphism
    // Self-reference FK is enforced in DB (migration 0004). Not declared here to avoid
    // Drizzle's circular-reference type inference issue.
    parentCommentId: uuid("parent_comment_id"),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    byParent: index("comments_parent_idx").on(t.parentType, t.parentId, sql`${t.createdAt} desc`),
    byParentComment: index("comments_parent_comment_idx").on(t.parentCommentId),
  }),
);

export const commentRevisions = pgTable("comment_revisions", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  commentId: uuid("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  editedBy: text("edited_by").notNull().references(() => users.id),
  editedAt: timestamp("edited_at", { withTimezone: true }).notNull().default(sql`now()`),
});
