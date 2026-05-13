import { describe, expect, test, beforeEach, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { withTransaction, closePool } from "@/tests/fixtures/db";
import { emit } from "@/lib/services/notifications";
import * as dispatch from "@/lib/email/dispatch";

const TEST_ORG = "org_test_emails";
const TEST_USER = "usr_test_emails-1";

async function setupOrgAndUser(tx: Parameters<Parameters<typeof withTransaction>[0]>[0]) {
  await tx.insert(schema.organizations).values({
    id: TEST_ORG,
    name: "Test Emails Org",
    slug: "test-emails-org",
  });
  await tx.insert(schema.users).values({
    id: TEST_USER,
    name: "Recipient",
    email: "recipient@test.example.com",
    emailVerified: true,
    systemRole: "admin",
  });
}

describe("notifications.emit — email dispatch", () => {
  beforeEach(() => {
    // Reset the mock to default success behavior before each test.
    vi.mocked(dispatch.sendNotificationEmail).mockResolvedValue({ ok: true, messageId: "test-skipped" });
  });

  afterAll(async () => {
    await closePool();
  });

  test("registered event creates both in_app and email deliveries", async () => {
    await withTransaction(async (tx) => {
      await setupOrgAndUser(tx);

      await emit(tx, {
        orgId: TEST_ORG,
        eventType: "work_request.submitted",
        recipientUserIds: [TEST_USER],
        payload: {
          workRequestId: "00000000-0000-0000-0000-000000000001",
          orgId: TEST_ORG,
          title: "Sample work request",
          actorId: TEST_USER,
        },
        relatedType: "work_request",
        relatedId: "00000000-0000-0000-0000-000000000001",
      });

      const notifs = await tx
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, TEST_USER));
      expect(notifs).toHaveLength(1);

      const deliveries = await tx
        .select()
        .from(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.notificationId, notifs[0]!.id));

      const channels = deliveries.map((d) => d.channel).sort();
      expect(channels).toEqual(["email", "in_app"]);
      expect(deliveries.every((d) => d.status === "sent")).toBe(true);
    });
  });

  test("dispatcher failure records email delivery as failed with error message", async () => {
    // Override mock to simulate "no template" error.
    vi.mocked(dispatch.sendNotificationEmail).mockResolvedValueOnce({
      ok: false,
      error: 'no template for event type "task.assigned"',
    });

    await withTransaction(async (tx) => {
      await setupOrgAndUser(tx);

      await emit(tx, {
        orgId: TEST_ORG,
        eventType: "task.assigned",
        recipientUserIds: [TEST_USER],
        payload: { taskId: "00000000-0000-0000-0000-000000000002", title: "Task" },
        relatedType: "task",
        relatedId: "00000000-0000-0000-0000-000000000002",
      });

      const [notif] = await tx
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, TEST_USER));
      expect(notif).toBeDefined();

      const deliveries = await tx
        .select()
        .from(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.notificationId, notif!.id));

      const inApp = deliveries.find((d) => d.channel === "in_app");
      const email = deliveries.find((d) => d.channel === "email");
      expect(inApp?.status).toBe("sent");
      expect(email?.status).toBe("failed");
      expect(email?.errorMessage).toContain("no template");
    });
  });

  test("emailEnabled=false skips email delivery entirely", async () => {
    await withTransaction(async (tx) => {
      await setupOrgAndUser(tx);

      // Org default: email off for this event type.
      await tx.insert(schema.notificationPreferences).values({
        orgId: TEST_ORG,
        userId: null,
        eventType: "work_request.submitted",
        inAppEnabled: true,
        emailEnabled: false,
      });

      await emit(tx, {
        orgId: TEST_ORG,
        eventType: "work_request.submitted",
        recipientUserIds: [TEST_USER],
        payload: {
          workRequestId: "00000000-0000-0000-0000-000000000003",
          orgId: TEST_ORG,
          title: "Quiet request",
          actorId: TEST_USER,
        },
      });

      const [notif] = await tx
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, TEST_USER));
      expect(notif).toBeDefined();

      const deliveries = await tx
        .select()
        .from(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.notificationId, notif!.id));

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]!.channel).toBe("in_app");
    });
  });
});
