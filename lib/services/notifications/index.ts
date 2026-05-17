import * as schema from "@/lib/db/schema";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { emitInputSchema, type EmitInput, listForUserInputSchema, type ListForUserInput, markReadInputSchema, type MarkReadInput, upsertPreferenceInputSchema, type UpsertPreferenceInput } from "./schemas";
import { resolvePreferences } from "./internal";
import { err, ok, type Result } from "@/lib/services/_result";
import type { OrgContext } from "@/lib/services/_context";
import { sendNotificationEmail } from "@/lib/email/dispatch";
import { notify } from "@/lib/services/realtime/notify";

export type { ListForUserInput, MarkReadInput, UpsertPreferenceInput, EmitInput } from "./schemas";

// Admin-facing type aliases — the admin wrappers reference these names.
export type { ListForUserInput as ListNotificationsInput, MarkReadInput as MarkNotificationsReadInput } from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

/**
 * Insert notification rows + delivery rows for each recipient. Two channels:
 * - "in_app" for users with inAppEnabled
 * - "email" for users with emailEnabled (template lookup happens in dispatch.ts;
 *   if no template is registered for the event type the delivery is recorded
 *   as failed but the originating action still succeeds)
 *
 * Idempotent on duplicate recipientUserIds (deduped before insert).
 */
export async function emit(db: AnyDb, input: EmitInput): Promise<void> {
  const parsed = emitInputSchema.parse(input);
  const uniqueRecipients = Array.from(new Set(parsed.recipientUserIds));

  const prefs = await resolvePreferences(db, parsed.orgId, parsed.eventType, uniqueRecipients);
  const inAppRecipients = prefs.filter((p) => p.inAppEnabled).map((p) => p.userId);
  const emailRecipientIds = prefs.filter((p) => p.emailEnabled).map((p) => p.userId);

  // 1. In-app
  let inAppNotifIds: { id: string; userId: string }[] = [];
  if (inAppRecipients.length > 0) {
    inAppNotifIds = await db
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
      .returning({ id: schema.notifications.id, userId: schema.notifications.userId });

    await db.insert(schema.notificationDeliveries).values(
      inAppNotifIds.map((row) => ({
        notificationId: row.id,
        channel: "in_app" as const,
        status: "sent" as const,
        sentAt: new Date(),
      })),
    );

    for (const row of inAppNotifIds) {
      try {
        await notify(db, { kind: "notification", orgId: parsed.orgId, userId: row.userId });
      } catch {
        /* best effort */
      }
    }
  }

  // 2. Email
  if (emailRecipientIds.length === 0) return;

  const userRows = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(inArray(schema.users.id, emailRecipientIds));

  const userToNotifId = new Map(inAppNotifIds.map((r) => [r.userId, r.id]));

  for (const user of userRows) {
    let notifId = userToNotifId.get(user.id);
    if (!notifId) {
      // Email-only delivery: insert a notification row first.
      const [row] = await db
        .insert(schema.notifications)
        .values({
          orgId: parsed.orgId,
          userId: user.id,
          eventType: parsed.eventType,
          payload: parsed.payload,
          relatedType: parsed.relatedType ?? null,
          relatedId: parsed.relatedId ?? null,
        })
        .returning({ id: schema.notifications.id });
      notifId = row!.id;
    }

    const result = await sendNotificationEmail(parsed.eventType, parsed.payload, {
      userId: user.id,
      email: user.email,
      name: user.name ?? null,
    });
    await db.insert(schema.notificationDeliveries).values({
      notificationId: notifId,
      channel: "email",
      status: result.ok ? "sent" : "failed",
      errorMessage: result.ok ? null : result.error,
      sentAt: result.ok ? new Date() : null,
    });
  }
}

type Notification = typeof schema.notifications.$inferSelect;

export type NotificationWithActor = Notification & {
  actor: { id: string; name: string | null; email: string } | null;
};

export type ListForUserResult = {
  notifications: NotificationWithActor[];
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

  // Resolve actor names from each notification's payload.actorId in one query.
  const actorIds = Array.from(
    new Set(
      notifications
        .map((n) => (n.payload as { actorId?: unknown }).actorId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  const actors = actorIds.length
    ? await db
        .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.id, actorIds))
    : [];
  const actorById = new Map(actors.map((a) => [a.id, a]));

  const enriched: NotificationWithActor[] = notifications.map((n) => {
    const id = (n.payload as { actorId?: unknown }).actorId;
    return { ...n, actor: typeof id === "string" ? (actorById.get(id) ?? null) : null };
  });

  return ok({ notifications: enriched, unreadCount });
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

export type NotificationPreferenceRow = {
  eventType: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
};

export async function listMyPreferences(
  db: AnyDb,
  ctx: OrgContext,
): Promise<Result<NotificationPreferenceRow[]>> {
  const rows = await db
    .select({
      eventType: schema.notificationPreferences.eventType,
      inAppEnabled: schema.notificationPreferences.inAppEnabled,
      emailEnabled: schema.notificationPreferences.emailEnabled,
    })
    .from(schema.notificationPreferences)
    .where(
      and(
        eq(schema.notificationPreferences.orgId, ctx.orgId),
        eq(schema.notificationPreferences.userId, ctx.actor.userId),
      ),
    );
  return ok(rows);
}

export async function upsertPreference(
  db: AnyDb,
  ctx: OrgContext,
  input: UpsertPreferenceInput,
): Promise<Result<true>> {
  const parsed = upsertPreferenceInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const target = parsed.data.target ?? "user";
  if (target === "org" && ctx.actor.role !== "admin") {
    return err("unauthorized", "Only admins can set the org default");
  }

  const userId = target === "org" ? null : ctx.actor.userId;

  const existingConds = [
    eq(schema.notificationPreferences.orgId, ctx.orgId),
    eq(schema.notificationPreferences.eventType, parsed.data.eventType),
    userId === null
      ? isNull(schema.notificationPreferences.userId)
      : eq(schema.notificationPreferences.userId, userId),
  ];

  const [existing] = await db
    .select({ id: schema.notificationPreferences.id })
    .from(schema.notificationPreferences)
    .where(and(...existingConds))
    .limit(1);

  if (existing) {
    await db
      .update(schema.notificationPreferences)
      .set({
        inAppEnabled: parsed.data.inAppEnabled,
        emailEnabled: parsed.data.emailEnabled,
      })
      .where(eq(schema.notificationPreferences.id, existing.id));
  } else {
    await db.insert(schema.notificationPreferences).values({
      orgId: ctx.orgId,
      userId,
      eventType: parsed.data.eventType,
      inAppEnabled: parsed.data.inAppEnabled,
      emailEnabled: parsed.data.emailEnabled,
    });
  }

  return ok(true);
}
