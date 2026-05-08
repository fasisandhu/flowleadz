import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { rejectWorkRequest, submitWorkRequest } from "@/lib/services/work-requests";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("work-requests.rejectWorkRequest", () => {
  it("admin rejects with reason; status -> rejected, linked task -> cancelled, submitter notified", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), {
        title: "x",
        projectId: project.id,
      });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;

      const r = await rejectWorkRequest(db, ctxOf(org.id, "admin", admin.id), {
        id: submitted.data.id,
        reason: "Out of scope for this engagement",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("rejected");
      expect(r.data.rejectionReason).toBe("Out of scope for this engagement");

      const [task] = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, r.data.resolvedTaskId!));
      expect(task!.status).toBe("cancelled");

      const taskLogs = await db
        .select()
        .from(schema.taskStatusLog)
        .where(eq(schema.taskStatusLog.taskId, r.data.resolvedTaskId!));
      expect(taskLogs.find((l) => l.toStatus === "cancelled" && l.fromStatus === "todo")).toBeDefined();

      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, customer.id));
      expect(notifs.filter((n) => n.eventType === "work_request.status_changed")).toHaveLength(1);
    });
  });

  it("requires a non-empty reason", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await rejectWorkRequest(db, ctxOf(org.id, "admin", admin.id), { id: submitted.data.id, reason: "" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("conflict if request is already non-submitted", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x", projectId: project.id });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      await rejectWorkRequest(db, ctxOf(org.id, "admin", admin.id), { id: submitted.data.id, reason: "no" });
      const r = await rejectWorkRequest(db, ctxOf(org.id, "admin", admin.id), { id: submitted.data.id, reason: "no" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("conflict");
    });
  });
});

afterAll(async () => {
  await closePool();
});
