import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { submitWorkRequest } from "@/lib/services/work-requests";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("work-requests.submitWorkRequest", () => {
  it("customer can submit; auto-creates task; resolved_task_id is set; admin notified", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);

      const r = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), {
        title: "Help with X",
        description: "Customer notes",
        projectId: project.id,
        priorityHint: "high",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("submitted");
      expect(r.data.submittedBy).toBe(customer.id);
      expect(r.data.priorityHint).toBe("high");
      expect(r.data.resolvedTaskId).not.toBeNull();

      const tasks = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, r.data.resolvedTaskId!));
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.source).toBe("from_request");
      expect(tasks[0]!.sourceRequestId).toBe(r.data.id);
      expect(tasks[0]!.projectId).toBe(project.id);
      expect(tasks[0]!.status).toBe("todo");

      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, admin.id));
      expect(notifs).toHaveLength(1);
      expect(notifs[0]!.eventType).toBe("work_request.submitted");

      const logs = await db
        .select()
        .from(schema.workRequestStatusLog)
        .where(eq(schema.workRequestStatusLog.workRequestId, r.data.id));
      expect(logs).toHaveLength(1);
      expect(logs[0]!.fromStatus).toBeNull();
      expect(logs[0]!.toStatus).toBe("submitted");
    });
  });

  it("supports null projectId (general inquiry → triage queue)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);

      const r = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), {
        title: "General",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.projectId).toBeNull();
      const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.id, r.data.resolvedTaskId!));
      expect(tasks[0]!.projectId).toBeNull();
    });
  });

  it("rejects projectId that belongs to another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, orgA.id);
      const otherProject = await createProject(db, orgB.id, admin.id);
      const r = await submitWorkRequest(db, ctxOf(orgA.id, "customer", customer.id), {
        title: "x",
        projectId: otherProject.id,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });

  it("rejects empty title", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const r = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("non-member customer cannot submit (unauthorized)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      // NOT a member of the org.
      const r = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
