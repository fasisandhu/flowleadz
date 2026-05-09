import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { listForUser } from "@/lib/services/notifications";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedNotification(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  userId: string,
  eventType: string,
  read: boolean = false,
  createdAtOffsetMs: number = 0,
) {
  const [row] = await db
    .insert(schema.notifications)
    .values({
      orgId,
      userId,
      eventType,
      payload: { foo: "bar" },
      readAt: read ? new Date() : null,
      createdAt: new Date(Date.now() + createdAtOffsetMs),
    })
    .returning();
  return row!;
}

describe("notifications.listForUser", () => {
  it("returns the user's notifications newest-first", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      await seedNotification(db, org.id, user.id, "task.assigned", false, -2000);
      await seedNotification(db, org.id, user.id, "task.assigned", false, -1000);
      await seedNotification(db, org.id, user.id, "task.assigned", false, 0);

      const r = await listForUser(db, ctxOf(org.id, "employee", user.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.notifications).toHaveLength(3);
      expect(
        new Date(r.data.notifications[0]!.createdAt).getTime(),
      ).toBeGreaterThanOrEqual(
        new Date(r.data.notifications[1]!.createdAt).getTime(),
      );
    });
  });

  it("filters to unread only when filter='unread'", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      await seedNotification(db, org.id, user.id, "task.assigned", true);
      await seedNotification(db, org.id, user.id, "task.assigned", false);

      const r = await listForUser(db, ctxOf(org.id, "employee", user.id), { filter: "unread" });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.notifications).toHaveLength(1);
      expect(r.data.notifications[0]!.readAt).toBeNull();
    });
  });

  it("returns unread count even when listing all", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      await seedNotification(db, org.id, user.id, "task.assigned", true);
      await seedNotification(db, org.id, user.id, "task.assigned", false);
      await seedNotification(db, org.id, user.id, "task.assigned", false);

      const r = await listForUser(db, ctxOf(org.id, "employee", user.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.unreadCount).toBe(2);
      expect(r.data.notifications).toHaveLength(3);
    });
  });

  it("only returns the actor's notifications, not other users", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const me = await createUser(db, { role: "employee" });
      const other = await createUser(db, { role: "employee" });
      await seedNotification(db, org.id, me.id, "task.assigned");
      await seedNotification(db, org.id, other.id, "task.assigned");

      const r = await listForUser(db, ctxOf(org.id, "employee", me.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.notifications).toHaveLength(1);
      expect(r.data.notifications[0]!.userId).toBe(me.id);
    });
  });

  it("respects limit + offset", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      for (let i = 0; i < 5; i++) {
        await seedNotification(db, org.id, user.id, "task.assigned", false, -i * 1000);
      }
      const r = await listForUser(db, ctxOf(org.id, "employee", user.id), { limit: 2, offset: 1 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.notifications).toHaveLength(2);
    });
  });
});

afterAll(async () => {
  await closePool();
});
