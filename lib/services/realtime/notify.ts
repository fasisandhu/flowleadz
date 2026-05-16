import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export type RealtimePayload =
  | {
      kind: "activity";
      orgId: string;
      taskId: string;
      eventKind: "update" | "status_change" | "time_log" | "comment" | "attachment";
    }
  | {
      kind: "notification";
      orgId: string;
      userId: string;
    };

/**
 * Issue a Postgres NOTIFY on the `crm_events` channel with a JSON payload.
 *
 * Safe to call inside the same DB transaction as the originating write —
 * the notification is queued until commit. Idempotent if you call it twice
 * for the same event (the SSE consumer will receive both).
 */
export async function notify(db: AnyDb, payload: RealtimePayload): Promise<void> {
  await db.execute(sql`SELECT pg_notify('crm_events', ${JSON.stringify(payload)})`);
}
