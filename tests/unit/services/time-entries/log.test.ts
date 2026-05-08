import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { assignProject, createOrg, createProject, createTask, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { logTime } from "@/lib/services/time-entries";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("time-entries.logTime", () => {
  it("employee logs time on a task they're assigned to via project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee", defaultHourlyRateCents: 15000 });
      const project = await createProject(db, org.id, admin.id, { hourlyRateCents: 25000 });
      await assignProject(db, employee.id, project.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await logTime(db, ctxOf(org.id, "employee", employee.id), {
        taskId: task.id,
        minutes: 90,
        loggedForDate: "2026-05-08",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.minutes).toBe(90);
      expect(r.data.rateCentsPerHour).toBe(25000);
      expect(r.data.projectId).toBe(project.id);
    });
  });

  it("falls back to user default rate when project has no rate", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee", defaultHourlyRateCents: 12000 });
      const project = await createProject(db, org.id, admin.id, { hourlyRateCents: null });
      await assignProject(db, employee.id, project.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await logTime(db, ctxOf(org.id, "employee", employee.id), {
        taskId: task.id,
        minutes: 30,
        loggedForDate: "2026-05-08",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.rateCentsPerHour).toBe(12000);
    });
  });

  it("rate is null when neither project nor user has a rate", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await logTime(db, ctxOf(org.id, "employee", employee.id), {
        taskId: task.id,
        minutes: 60,
        loggedForDate: "2026-05-08",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.rateCentsPerHour).toBeNull();
    });
  });

  it("rejects logging time on a task with null projectId (triage)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const [request] = await db
        .insert(schema.workRequests)
        .values({ orgId: org.id, submittedBy: admin.id, title: "x", status: "submitted" })
        .returning();
      const [task] = await db
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: null,
          title: "Triage T",
          source: "from_request" as const,
          sourceRequestId: request!.id,
          createdBy: admin.id,
        })
        .returning();
      const r = await logTime(db, ctxOf(org.id, "admin", admin.id), {
        taskId: task!.id,
        minutes: 60,
        loggedForDate: "2026-05-08",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("rejects zero or negative minutes", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await logTime(db, ctxOf(org.id, "admin", admin.id), {
        taskId: task.id,
        minutes: 0,
        loggedForDate: "2026-05-08",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("customer cannot log time", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await logTime(db, ctxOf(org.id, "customer", customer.id), {
        taskId: task.id,
        minutes: 60,
        loggedForDate: "2026-05-08",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
