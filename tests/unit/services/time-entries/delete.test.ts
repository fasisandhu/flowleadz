import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createTask, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { deleteTimeEntry } from "@/lib/services/time-entries";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedEntry(db: any, orgId: string, projectId: string, taskId: string, userId: string) {
  const [row] = await db
    .insert(schema.timeEntries)
    .values({ orgId, projectId, taskId, userId, minutes: 60, loggedForDate: "2026-05-08" })
    .returning();
  return row;
}

describe("time-entries.deleteTimeEntry", () => {
  it("owner can delete", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const owner = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const entry = await seedEntry(db, org.id, project.id, task.id, owner.id);
      const r = await deleteTimeEntry(db, ctxOf(org.id, "employee", owner.id), { id: entry.id });
      expect(r.ok).toBe(true);
      const found = await db.select().from(schema.timeEntries).where(eq(schema.timeEntries.id, entry.id));
      expect(found).toHaveLength(0);
    });
  });

  it("not_found if entry is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const task = await createTask(db, orgB.id, project.id, admin.id);
      const entry = await seedEntry(db, orgB.id, project.id, task.id, admin.id);
      const r = await deleteTimeEntry(db, ctxOf(orgA.id, "admin", admin.id), { id: entry.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

afterAll(async () => {
  await closePool();
});
