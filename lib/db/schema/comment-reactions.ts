import { pgTable, uuid, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { comments } from "./comments";
import { users } from "./better-auth";

export const commentReactions = pgTable(
  "comment_reactions",
  {
    commentId: uuid("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.commentId, t.userId, t.emoji] }),
    byComment: index("comment_reactions_comment_idx").on(t.commentId),
  }),
);
