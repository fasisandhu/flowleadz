import { afterAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { upsertPreference } from "@/lib/services/notifications";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("notifications.upsertPreference", () => {
  it("user can set their own preference", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "customer" });
      await createMembership(db, user.id, org.id);

      const r = await upsertPreference(db, ctxOf(org.id, "customer", user.id), {
        eventType: "task.status_changed",
        inAppEnabled: false,
        emailEnabled: true,
      });
      expect(r.ok).toBe(true);

      const rows = await db
        .select()
        .from(schema.notificationPreferences)
        .where(
          and(
            eq(schema.notificationPreferences.userId, user.id),
            eq(schema.notificationPreferences.eventType, "task.status_changed"),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.inAppEnabled).toBe(false);
      expect(rows[0]!.emailEnabled).toBe(true);
    });
  });

  it("upsert: second call overwrites the same row", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });

      await upsertPreference(db, ctxOf(org.id, "employee", user.id), {
        eventType: "task.assigned",
        inAppEnabled: true,
        emailEnabled: true,
      });
      await upsertPreference(db, ctxOf(org.id, "employee", user.id), {
        eventType: "task.assigned",
        inAppEnabled: false,
        emailEnabled: false,
      });

      const rows = await db
        .select()
        .from(schema.notificationPreferences)
        .where(eq(schema.notificationPreferences.userId, user.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.inAppEnabled).toBe(false);
      expect(rows[0]!.emailEnabled).toBe(false);
    });
  });

  it("admin can set the org default with target='org' (user_id is null)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });

      const r = await upsertPreference(db, ctxOf(org.id, "admin", admin.id), {
        target: "org",
        eventType: "comment.posted",
        inAppEnabled: true,
        emailEnabled: false,
      });
      expect(r.ok).toBe(true);

      const rows = await db
        .select()
        .from(schema.notificationPreferences)
        .where(
          and(
            isNull(schema.notificationPreferences.userId),
            eq(schema.notificationPreferences.eventType, "comment.posted"),
            eq(schema.notificationPreferences.orgId, org.id),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.emailEnabled).toBe(false);
    });
  });

  it("non-admin cannot set the org default", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const employee = await createUser(db, { role: "employee" });
      const r = await upsertPreference(db, ctxOf(org.id, "employee", employee.id), {
        target: "org",
        eventType: "comment.posted",
        inAppEnabled: true,
        emailEnabled: false,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
