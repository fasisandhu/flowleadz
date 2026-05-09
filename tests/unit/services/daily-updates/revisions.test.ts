import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { listDailyUpdateRevisions } from "@/lib/services/daily-updates";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("daily-updates.listDailyUpdateRevisions", () => {
  it("returns revisions newest-first", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "current",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      await db.insert(schema.dailyUpdateRevisions).values({
        dailyUpdateId: update!.id,
        body: "v1",
        activityType: "planning",
        visibility: "customer_visible",
        editedBy: admin.id,
      });
      await db.insert(schema.dailyUpdateRevisions).values({
        dailyUpdateId: update!.id,
        body: "v2",
        activityType: "execution",
        visibility: "customer_visible",
        editedBy: admin.id,
      });
      const r = await listDailyUpdateRevisions(db, ctxOf(org.id, "admin", admin.id), update!.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(2);
      expect(r.data[0]!.body).toBe("v2");
      expect(r.data[1]!.body).toBe("v1");
    });
  });

  it("respects daily-update read auth (customer can't see internal_only revisions)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "internal",
          activityType: "execution",
          visibility: "internal_only",
          logDate: "2026-05-08",
        })
        .returning();
      const r = await listDailyUpdateRevisions(db, ctxOf(org.id, "customer", customer.id), update!.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
