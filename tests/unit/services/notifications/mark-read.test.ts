import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { markRead } from "@/lib/services/notifications";
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
) {
  const [row] = await db
    .insert(schema.notifications)
    .values({
      orgId,
      userId,
      eventType: "task.assigned",
      payload: {},
    })
    .returning();
  return row!;
}

describe("notifications.markRead", () => {
  it("flips a single unread notification to read", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      const n = await seedNotification(db, org.id, user.id);

      const r = await markRead(db, ctxOf(org.id, "employee", user.id), { ids: [n.id] });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.markedCount).toBe(1);

      const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, n.id));
      expect(row!.readAt).not.toBeNull();
    });
  });

  it("bulk marks multiple in one call", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      const n1 = await seedNotification(db, org.id, user.id);
      const n2 = await seedNotification(db, org.id, user.id);

      const r = await markRead(db, ctxOf(org.id, "employee", user.id), { ids: [n1.id, n2.id] });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.markedCount).toBe(2);
    });
  });

  it("does not flip notifications belonging to another user (markedCount=0)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const me = await createUser(db, { role: "employee" });
      const other = await createUser(db, { role: "employee" });
      const n = await seedNotification(db, org.id, other.id);

      const r = await markRead(db, ctxOf(org.id, "employee", me.id), { ids: [n.id] });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.markedCount).toBe(0);

      const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, n.id));
      expect(row!.readAt).toBeNull();
    });
  });

  it("idempotent on already-read notifications", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      const n = await seedNotification(db, org.id, user.id);
      await markRead(db, ctxOf(org.id, "employee", user.id), { ids: [n.id] });
      const r = await markRead(db, ctxOf(org.id, "employee", user.id), { ids: [n.id] });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.markedCount).toBe(0);
    });
  });

  it("rejects empty ids array", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      const r = await markRead(db, ctxOf(org.id, "employee", user.id), { ids: [] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });
});

afterAll(async () => {
  await closePool();
});
