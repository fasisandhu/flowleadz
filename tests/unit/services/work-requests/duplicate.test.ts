import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createTask, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { markDuplicateWorkRequest, submitWorkRequest } from "@/lib/services/work-requests";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("work-requests.markDuplicateWorkRequest", () => {
  it("admin marks duplicate; cancels linked task; submitter notified", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const canonicalTask = await createTask(db, org.id, project.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), {
        title: "dup",
        projectId: project.id,
      });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;

      const r = await markDuplicateWorkRequest(db, ctxOf(org.id, "admin", admin.id), {
        id: submitted.data.id,
        canonicalTaskId: canonicalTask.id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("duplicate");
      expect(r.data.rejectionReason).toContain(canonicalTask.id);

      const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, r.data.resolvedTaskId!));
      expect(task!.status).toBe("cancelled");

      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, customer.id));
      expect(notifs.filter((n) => n.eventType === "work_request.status_changed")).toHaveLength(1);
    });
  });

  it("validation: canonicalTaskId must belong to same org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, orgA.id);
      const otherProject = await createProject(db, orgB.id, admin.id);
      const otherTask = await createTask(db, orgB.id, otherProject.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(orgA.id, "customer", customer.id), { title: "x" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await markDuplicateWorkRequest(db, ctxOf(orgA.id, "admin", admin.id), {
        id: submitted.data.id,
        canonicalTaskId: otherTask.id,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

afterAll(async () => {
  await closePool();
});
