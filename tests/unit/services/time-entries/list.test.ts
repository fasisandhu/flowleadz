import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { assignProject, createOrg, createProject, createTask, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { listTimeEntries } from "@/lib/services/time-entries";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedEntry(db: any, orgId: string, projectId: string, taskId: string, userId: string, opts: any = {}) {
  const [row] = await db
    .insert(schema.timeEntries)
    .values({
      orgId,
      projectId,
      taskId,
      userId,
      minutes: opts.minutes ?? 60,
      loggedForDate: opts.loggedForDate ?? "2026-05-08",
      rateCentsPerHour: opts.rateCentsPerHour ?? null,
    })
    .returning();
  return row;
}

describe("time-entries.listTimeEntries", () => {
  it("admin sees all entries in their org", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      await seedEntry(db, org.id, project.id, task.id, employee.id);
      await seedEntry(db, org.id, project.id, task.id, admin.id);
      const r = await listTimeEntries(db, ctxOf(org.id, "admin", admin.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(2);
    });
  });

  it("employee only sees entries for projects they're assigned to", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const p1 = await createProject(db, org.id, admin.id);
      const p2 = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, p1.id);
      const t1 = await createTask(db, org.id, p1.id, admin.id);
      const t2 = await createTask(db, org.id, p2.id, admin.id);
      await seedEntry(db, org.id, p1.id, t1.id, admin.id);
      await seedEntry(db, org.id, p2.id, t2.id, admin.id);
      const r = await listTimeEntries(db, ctxOf(org.id, "employee", employee.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(1);
      expect(r.data[0]!.projectId).toBe(p1.id);
    });
  });

  it("customer cannot list time entries (unauthorized)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      const r = await listTimeEntries(db, ctxOf(org.id, "customer", customer.id), {});
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("filters: projectId + dateRange", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      await seedEntry(db, org.id, project.id, task.id, admin.id, { loggedForDate: "2026-05-01" });
      await seedEntry(db, org.id, project.id, task.id, admin.id, { loggedForDate: "2026-05-08" });
      await seedEntry(db, org.id, project.id, task.id, admin.id, { loggedForDate: "2026-05-15" });
      const r = await listTimeEntries(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        fromDate: "2026-05-05",
        toDate: "2026-05-10",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(1);
      expect(r.data[0]!.loggedForDate).toBe("2026-05-08");
    });
  });
});

afterAll(async () => {
  await closePool();
});
