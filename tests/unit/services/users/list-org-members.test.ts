import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createUser } from "@/tests/fixtures/factories";
import { listOrgMembers } from "@/lib/services/users";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("users.listOrgMembers", () => {
  it("admin sees all customers in the org, sorted by email", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const c1 = await createUser(db, { role: "customer", email: "b@x.test" });
      const c2 = await createUser(db, { role: "customer", email: "a@x.test" });
      await createMembership(db, c1.id, org.id);
      await createMembership(db, c2.id, org.id);

      const r = await listOrgMembers(db, ctxOf(org.id, "admin", admin.id), { orgId: org.id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((u) => u.email)).toEqual(["a@x.test", "b@x.test"]);
    });
  });

  it("non-admin cannot list", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const employee = await createUser(db, { role: "employee" });
      const r = await listOrgMembers(db, ctxOf(org.id, "employee", employee.id), { orgId: org.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
