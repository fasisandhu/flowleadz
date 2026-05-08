import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createTask, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { updateTimeEntry } from "@/lib/services/time-entries";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedEntry(db: Parameters<typeof createUser>[0], orgId: string, projectId: string, taskId: string, userId: string) {
  const [row] = await db
    .insert(schema.timeEntries)
    .values({ orgId, projectId, taskId, userId, minutes: 60, loggedForDate: "2026-05-08" })
    .returning();
  return row!;
}

describe("time-entries.updateTimeEntry", () => {
  it("owner can update minutes + note", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const entry = await seedEntry(db, org.id, project.id, task.id, employee.id);

      const r = await updateTimeEntry(db, ctxOf(org.id, "employee", employee.id), {
        id: entry.id,
        minutes: 90,
        note: "Took longer than expected",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.minutes).toBe(90);
      expect(r.data.note).toBe("Took longer than expected");
    });
  });

  it("admin can update any entry", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const entry = await seedEntry(db, org.id, project.id, task.id, employee.id);
      const r = await updateTimeEntry(db, ctxOf(org.id, "admin", admin.id), { id: entry.id, minutes: 30 });
      expect(r.ok).toBe(true);
    });
  });

  it("non-owner non-admin cannot update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const owner = await createUser(db, { role: "employee" });
      const other = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const entry = await seedEntry(db, org.id, project.id, task.id, owner.id);
      const r = await updateTimeEntry(db, ctxOf(org.id, "employee", other.id), { id: entry.id, minutes: 1 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
