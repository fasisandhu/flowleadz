import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export async function logStatusTransition(
  db: AnyDb,
  taskId: string,
  fromStatus: string | null,
  toStatus: string,
  changedBy: string,
  note?: string,
) {
  await db.insert(schema.taskStatusLog).values({
    taskId,
    fromStatus,
    toStatus,
    changedBy,
    note: note ?? null,
  });
}
