import * as schema from "@/lib/db/schema";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { emitInputSchema, type EmitInput } from "./schemas";
import { resolvePreferences } from "./internal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

/**
 * Insert notification rows + in_app delivery rows for each recipient
 * whose effective preference allows it. Email delivery is deferred to Plan 4.
 *
 * Idempotent on duplicate recipientUserIds (deduped before insert).
 */
export async function emit(db: AnyDb, input: EmitInput): Promise<void> {
  const parsed = emitInputSchema.parse(input);
  const uniqueRecipients = Array.from(new Set(parsed.recipientUserIds));

  const prefs = await resolvePreferences(db, parsed.orgId, parsed.eventType, uniqueRecipients);
  const inAppRecipients = prefs.filter((p) => p.inAppEnabled).map((p) => p.userId);

  if (inAppRecipients.length === 0) return;

  const inserted = await db
    .insert(schema.notifications)
    .values(
      inAppRecipients.map((userId) => ({
        orgId: parsed.orgId,
        userId,
        eventType: parsed.eventType,
        payload: parsed.payload,
        relatedType: parsed.relatedType ?? null,
        relatedId: parsed.relatedId ?? null,
      })),
    )
    .returning({ id: schema.notifications.id });

  await db.insert(schema.notificationDeliveries).values(
    inserted.map((row) => ({
      notificationId: row.id,
      channel: "in_app" as const,
      status: "sent" as const,
      sentAt: new Date(),
    })),
  );
}
