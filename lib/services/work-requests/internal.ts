import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export async function logRequestStatusTransition(
  db: AnyDb,
  workRequestId: string,
  fromStatus: string | null,
  toStatus: string,
  changedBy: string,
  note?: string,
) {
  await db.insert(schema.workRequestStatusLog).values({
    workRequestId,
    fromStatus,
    toStatus,
    changedBy,
    note: note ?? null,
  });
}
