import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import {
  assignProject,
  createMembership,
  createOrg,
  createProject,
  createUser,
} from "@/tests/fixtures/factories";
import { listWorkRequests, getWorkRequest, submitWorkRequest } from "@/lib/services/work-requests";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("work-requests.listWorkRequests", () => {
  it("admin sees all requests in their org", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const c1 = await createUser(db, { role: "customer" });
      const c2 = await createUser(db, { role: "customer" });
      await createMembership(db, c1.id, org.id);
      await createMembership(db, c2.id, org.id);
      await submitWorkRequest(db, ctxOf(org.id, "customer", c1.id), { title: "from c1" });
      await submitWorkRequest(db, ctxOf(org.id, "customer", c2.id), { title: "from c2" });
      const r = await listWorkRequests(db, ctxOf(org.id, "admin", admin.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((w) => w.title).sort()).toEqual(["from c1", "from c2"]);
    });
  });

  it("customer only sees their own org's requests", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "mine" });
      const r = await listWorkRequests(db, ctxOf(org.id, "customer", customer.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((w) => w.title)).toEqual(["mine"]);
    });
  });

  it("employee sees requests for projects they're assigned to (and unassigned-project triage)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const p1 = await createProject(db, org.id, admin.id);
      const p2 = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, p1.id);
      await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "On P1", projectId: p1.id });
      await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "On P2", projectId: p2.id });
      await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "Triage" });
      const r = await listWorkRequests(db, ctxOf(org.id, "employee", employee.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((w) => w.title).sort()).toEqual(["On P1", "Triage"]);
    });
  });

  it("status filter narrows result", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "open" });
      const r = await listWorkRequests(db, ctxOf(org.id, "admin", admin.id), { status: "submitted" });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(1);
    });
  });
});

describe("work-requests.getWorkRequest", () => {
  it("admin fetches", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await getWorkRequest(db, ctxOf(org.id, "admin", admin.id), submitted.data.id);
      expect(r.ok).toBe(true);
    });
  });

  it("customer can fetch their own", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const submitted = await submitWorkRequest(db, ctxOf(org.id, "customer", customer.id), { title: "x" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await getWorkRequest(db, ctxOf(org.id, "customer", customer.id), submitted.data.id);
      expect(r.ok).toBe(true);
    });
  });

  it("not_found when in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, orgB.id);
      const submitted = await submitWorkRequest(db, ctxOf(orgB.id, "customer", customer.id), { title: "x" });
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      const r = await getWorkRequest(db, ctxOf(orgA.id, "admin", admin.id), submitted.data.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

afterAll(async () => {
  await closePool();
});
