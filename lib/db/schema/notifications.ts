import { pgTable, uuid, text, timestamp, boolean, jsonb, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, users } from "./better-auth";

export const notificationChannelEnum = pgEnum("notification_channel", ["email", "in_app"]);

export const notificationDeliveryStatusEnum = pgEnum("notification_delivery_status", [
  "queued",
  "sent",
  "failed",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: text("org_id").notNull().references(() => organizations.id),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    relatedType: text("related_type"),
    relatedId: uuid("related_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    byUserUnread: index("notifications_user_unread_idx").on(t.userId, t.readAt, sql`${t.createdAt} desc`),
  }),
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull().references(() => organizations.id),
    eventType: text("event_type").notNull(),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    emailEnabled: boolean("email_enabled").notNull().default(true),
  },
  (t) => ({
    uniquePref: uniqueIndex("notification_preferences_unique_idx")
      .on(sql`coalesce(${t.userId}, '__org_default__')`, t.orgId, t.eventType),
  }),
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    notificationId: uuid("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum("channel").notNull(),
    status: notificationDeliveryStatusEnum("status").notNull().default("queued"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    failedRetry: index("notification_deliveries_failed_idx")
      .on(t.status, t.createdAt)
      .where(sql`${t.status} = 'failed'`),
  }),
);
