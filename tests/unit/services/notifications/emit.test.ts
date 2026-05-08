import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { emit } from "@/lib/services/notifications";

describe("notifications.emit", () => {
  it("inserts a notifications row + in_app delivery for each recipient", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const u1 = await createUser(db, { role: "employee" });
      const u2 = await createUser(db, { role: "employee" });

      await emit(db, {
        orgId: org.id,
        eventType: "task.assigned",
        recipientUserIds: [u1.id, u2.id],
        payload: { taskId: "t-1", actorId: "a-1" },
        relatedType: "task",
        relatedId: "00000000-0000-7000-8000-000000000001",
      });

      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.orgId, org.id));
      expect(notifs).toHaveLength(2);
      expect(notifs.map((n) => n.userId).sort()).toEqual([u1.id, u2.id].sort());

      const deliveries = await db.select().from(schema.notificationDeliveries);
      expect(deliveries.filter((d) => d.channel === "in_app")).toHaveLength(2);
      expect(deliveries.filter((d) => d.channel === "email")).toHaveLength(0);
    });
  });

  it("deduplicates recipients", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const u1 = await createUser(db, { role: "employee" });
      await emit(db, {
        orgId: org.id,
        eventType: "task.assigned",
        recipientUserIds: [u1.id, u1.id, u1.id],
        payload: { taskId: "t-1", actorId: "a-1" },
      });
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.orgId, org.id));
      expect(notifs).toHaveLength(1);
    });
  });

  it("respects user-level preference override (in_app=false → no row)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const u1 = await createUser(db, { role: "employee" });
      await db.insert(schema.notificationPreferences).values({
        userId: u1.id,
        orgId: org.id,
        eventType: "task.assigned",
        inAppEnabled: false,
        emailEnabled: false,
      });
      await emit(db, {
        orgId: org.id,
        eventType: "task.assigned",
        recipientUserIds: [u1.id],
        payload: { taskId: "t-1", actorId: "a-1" },
      });
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.orgId, org.id));
      expect(notifs).toHaveLength(0);
    });
  });
});

afterAll(async () => {
  await closePool();
});
