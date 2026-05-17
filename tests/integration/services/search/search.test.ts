import { describe, expect, test } from "vitest";
import * as schema from "@/lib/db/schema";
import { withTransaction } from "@/tests/fixtures/db";
import {
  createMembership,
  createOrg,
  createProject,
  createUser,
} from "@/tests/fixtures/factories";
import { searchAll } from "@/lib/services/search";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("search.searchAll", () => {
  test("matches a task by title for admin", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const project = await createProject(tx, org.id, admin.id);
      await tx.insert(schema.tasks).values({
        orgId: org.id,
        projectId: project.id,
        title: "Build the pricing page",
        description: "Hero, plans, CTA",
        source: "admin_created",
        createdBy: admin.id,
      });

      const r = await searchAll(tx, ctxOf(org.id, "admin", admin.id), { query: "pricing", limit: 10 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const taskHits = r.data.filter((x) => x.kind === "task");
      expect(taskHits.length).toBe(1);
      expect(taskHits[0]!.title).toBe("Build the pricing page");
    });
  });

  test("hides internal_only updates from customer", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const customer = await createUser(tx, { role: "customer" });
      await createMembership(tx, customer.id, org.id);
      const project = await createProject(tx, org.id, admin.id);
      await tx.insert(schema.dailyUpdates).values({
        orgId: org.id,
        projectId: project.id,
        userId: admin.id,
        body: "Internal pricing strategy meeting notes",
        activityType: "meeting",
        visibility: "internal_only",
        logDate: "2026-05-10",
      });

      const r = await searchAll(tx, ctxOf(org.id, "customer", customer.id), { query: "pricing", limit: 10 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.filter((x) => x.kind === "update").length).toBe(0);
    });
  });

  test("employee only sees results from assigned projects", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const employee = await createUser(tx, { role: "employee" });
      const assignedProject = await createProject(tx, org.id, admin.id);
      const otherProject = await createProject(tx, org.id, admin.id);
      await tx.insert(schema.projectAssignments).values({
        userId: employee.id,
        projectId: assignedProject.id,
      });
      await tx.insert(schema.tasks).values({
        orgId: org.id,
        projectId: assignedProject.id,
        title: "Assigned pricing task",
        source: "admin_created",
        createdBy: admin.id,
      });
      await tx.insert(schema.tasks).values({
        orgId: org.id,
        projectId: otherProject.id,
        title: "Unassigned pricing task",
        source: "admin_created",
        createdBy: admin.id,
      });

      const r = await searchAll(tx, ctxOf(org.id, "employee", employee.id), { query: "pricing", limit: 10 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const titles = r.data.filter((x) => x.kind === "task").map((x) => x.title);
      expect(titles).toContain("Assigned pricing task");
      expect(titles).not.toContain("Unassigned pricing task");
    });
  });

  test("empty query returns empty result without error", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const r = await searchAll(tx, ctxOf(org.id, "admin", admin.id), { query: "", limit: 10 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toEqual([]);
    });
  });

  test("validates query length", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const r = await searchAll(tx, ctxOf(org.id, "admin", admin.id), {
        query: "x".repeat(501),
        limit: 10,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });
});
