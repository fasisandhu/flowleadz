import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import {
  assignProject,
  createMembership,
  createOrg,
  createProject,
  createTask,
  createUser,
} from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { listTasks, getTask } from "@/lib/services/tasks";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("tasks.listTasks", () => {
  it("admin sees all tasks in their org (including triage)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const [request] = await db
        .insert(schema.workRequests)
        .values({ orgId: org.id, submittedBy: admin.id, title: "x", status: "submitted" })
        .returning();
      await createTask(db, org.id, project.id, admin.id, { title: "with project" });
      // Triage task (no project, from_request) inserted directly because factory doesn't support null projectId
      await db.insert(schema.tasks).values({
        orgId: org.id,
        projectId: null,
        title: "triage",
        source: "from_request",
        sourceRequestId: request!.id,
        createdBy: admin.id,
      });
      const r = await listTasks(db, ctxOf(org.id, "admin", admin.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((t) => t.title).sort()).toEqual(["triage", "with project"]);
    });
  });

  it("employee only sees tasks on their assigned projects", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const p1 = await createProject(db, org.id, admin.id);
      const p2 = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, p1.id);
      await createTask(db, org.id, p1.id, admin.id, { title: "On P1" });
      await createTask(db, org.id, p2.id, admin.id, { title: "On P2" });
      const r = await listTasks(db, ctxOf(org.id, "employee", employee.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((t) => t.title)).toEqual(["On P1"]);
    });
  });

  it("customer only sees customer_visible tasks with non-null project_id", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const [request] = await db
        .insert(schema.workRequests)
        .values({ orgId: org.id, submittedBy: admin.id, title: "x", status: "submitted" })
        .returning();
      await createTask(db, org.id, project.id, admin.id, { title: "Visible", customerVisible: true });
      await createTask(db, org.id, project.id, admin.id, { title: "Internal", customerVisible: false });
      await db.insert(schema.tasks).values({
        orgId: org.id,
        projectId: null,
        title: "Triage",
        source: "from_request",
        sourceRequestId: request!.id,
        createdBy: admin.id,
      });
      const r = await listTasks(db, ctxOf(org.id, "customer", customer.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((t) => t.title)).toEqual(["Visible"]);
    });
  });

  it("status + projectId filters narrow the result", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      await createTask(db, org.id, project.id, admin.id, { title: "TodoT", status: "todo" });
      await createTask(db, org.id, project.id, admin.id, { title: "DoneT", status: "done" });
      const r = await listTasks(db, ctxOf(org.id, "admin", admin.id), { status: "todo", projectId: project.id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((t) => t.title)).toEqual(["TodoT"]);
    });
  });
});

describe("tasks.getTask", () => {
  it("admin fetches a task", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await getTask(db, ctxOf(org.id, "admin", admin.id), task.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.id).toBe(task.id);
    });
  });

  it("customer cannot get an internal task", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id, { customerVisible: false });
      const r = await getTask(db, ctxOf(org.id, "customer", customer.id), task.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
