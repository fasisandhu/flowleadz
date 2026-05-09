import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;
type Comment = typeof schema.comments.$inferSelect;

export async function captureCommentRevision(
  db: AnyDb,
  prior: Comment,
  editedBy: string,
) {
  await db.insert(schema.commentRevisions).values({
    commentId: prior.id,
    body: prior.body,
    editedBy,
  });
}
