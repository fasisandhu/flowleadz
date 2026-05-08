import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;
type DailyUpdate = typeof schema.dailyUpdates.$inferSelect;

/**
 * Snapshot the prior state of a daily update into daily_update_revisions
 * before applying the update.
 */
export async function captureRevision(
  db: AnyDb,
  prior: DailyUpdate,
  editedBy: string,
) {
  await db.insert(schema.dailyUpdateRevisions).values({
    dailyUpdateId: prior.id,
    body: prior.body,
    activityType: prior.activityType,
    visibility: prior.visibility,
    editedBy,
  });
}
