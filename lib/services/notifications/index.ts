import * as schema from "@/lib/db/schema";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { emitInputSchema, type EmitInput, listForUserInputSchema, type ListForUserInput, markReadInputSchema, type MarkReadInput } from "./schemas";
import { resolvePreferences } from "./internal";
import { err, ok, type Result } from "@/lib/services/_result";
import type { OrgContext } from "@/lib/services/_context";

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

type Notification = typeof schema.notifications.$inferSelect;

export type ListForUserResult = {
  notifications: Notification[];
  unreadCount: number;
};

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function listForUser(
  db: AnyDb,
  ctx: OrgContext,
  input: ListForUserInput,
): Promise<Result<ListForUserResult>> {
  const parsed = listForUserInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const conditions = [eq(schema.notifications.userId, ctx.actor.userId)];
  if (parsed.data.filter === "unread") {
    conditions.push(isNull(schema.notifications.readAt));
  }

  const rowsQuery = db
    .select()
    .from(schema.notifications)
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(parsed.data.limit ?? 50)
    .offset(parsed.data.offset ?? 0);

  const unreadQuery = db
    .select({ value: count() })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, ctx.actor.userId),
        isNull(schema.notifications.readAt),
      ),
    );

  const [notifications, unreadCountRows] = await Promise.all([rowsQuery, unreadQuery]);
  const unreadCount = Number(unreadCountRows[0]?.value ?? 0);

  return ok({ notifications, unreadCount });
}

export async function markRead(
  db: AnyDb,
  ctx: OrgContext,
  input: MarkReadInput,
): Promise<Result<{ markedCount: number }>> {
  const parsed = markReadInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const result = await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        inArray(schema.notifications.id, parsed.data.ids),
        eq(schema.notifications.userId, ctx.actor.userId),
        isNull(schema.notifications.readAt),
      ),
    )
    .returning({ id: schema.notifications.id });

  return ok({ markedCount: result.length });
}
