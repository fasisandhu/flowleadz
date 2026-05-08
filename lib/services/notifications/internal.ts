import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export type ResolvedPreference = {
  userId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
};

/**
 * Resolve effective notification preferences for a set of users + a single event type
 * within an org. Returns one entry per user, defaulting to (true, true) if neither
 * a user-specific nor org-wide row exists.
 */
export async function resolvePreferences(
  db: AnyDb,
  orgId: string,
  eventType: string,
  userIds: string[],
): Promise<ResolvedPreference[]> {
  if (userIds.length === 0) return [];

  const rows = await db
    .select({
      userId: schema.notificationPreferences.userId,
      inAppEnabled: schema.notificationPreferences.inAppEnabled,
      emailEnabled: schema.notificationPreferences.emailEnabled,
    })
    .from(schema.notificationPreferences)
    .where(
      and(
        eq(schema.notificationPreferences.orgId, orgId),
        eq(schema.notificationPreferences.eventType, eventType),
        or(
          isNull(schema.notificationPreferences.userId),
          inArray(schema.notificationPreferences.userId, userIds),
        ),
      ),
    );

  const orgDefault = rows.find((r) => r.userId === null);
  const userOverrides = new Map(
    rows.filter((r) => r.userId !== null).map((r) => [r.userId!, r]),
  );

  return userIds.map((uid) => {
    const override = userOverrides.get(uid);
    if (override) {
      return { userId: uid, inAppEnabled: override.inAppEnabled, emailEnabled: override.emailEnabled };
    }
    if (orgDefault) {
      return { userId: uid, inAppEnabled: orgDefault.inAppEnabled, emailEnabled: orgDefault.emailEnabled };
    }
    return { userId: uid, inAppEnabled: true, emailEnabled: true };
  });
}
