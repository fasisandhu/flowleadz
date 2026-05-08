import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { acceptWorkRequest, submitWorkRequest } from "@/lib/services/work-requests";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("work-requests.acceptWorkRequest", () => {
  it("admin accepts a request that already has a project", async () => {
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

      const r = await acceptWorkRequest(db, ctxOf(org.id, "admin", admin.id), {
        id: submitted.data.id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("accepted");
      expect(r.data.reviewedBy).toBe(admin.id);
      expect(r.data.reviewedAt).not.toBeNull();

      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, customer.id));
      expect(notifs.filter((n) => n.eventType === "work_request.status_changed")).toHaveLength(1);

      const logs = await db
        .select()
        .from(schema.workRequestStatusLog)
        .where(eq(schema.workRequestStatusLog.workRequestId, submitted.data.id));
      expect(logs.find((l) => l.toStatus === "accepted")).toBeDefined();
    });
  });

  it("admin assigns project on accept when request had none", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "general" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;

      const r = await acceptWorkRequest(db, ctxOf(org.id, "admin", admin.id), {
        id: submitted.data.id,
        projectId: project.id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.projectId).toBe(project.id);
      const tasks = await db
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, r.data.resolvedTaskId!));
      expect(tasks[0]!.projectId).toBe(project.id);
    });
  });

  it("requires projectId when request has no project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await acceptWorkRequest(db, ctxOf(org.id, "admin", admin.id), { id: submitted.data.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("rejects accept on a non-submitted request", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x", projectId: project.id });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const first = await acceptWorkRequest(db, ctxOf(org.id, "admin", admin.id), { id: submitted.data.id });
      expect(first.ok).toBe(true);
      const second = await acceptWorkRequest(db, ctxOf(org.id, "admin", admin.id), { id: submitted.data.id });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe("conflict");
    });
  });

  it("non-admin cannot accept", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x", projectId: project.id });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await acceptWorkRequest(db, ctxOf(org.id, "employee", employee.id), { id: submitted.data.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
