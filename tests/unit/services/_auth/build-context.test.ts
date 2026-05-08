import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createUser } from "@/tests/fixtures/factories";
import { buildOrgContext } from "@/lib/services/_auth/build-context";

describe("buildOrgContext", () => {
  it("returns OrgContext for a customer with their membership org", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "customer" });
      await createMembership(db, user.id, org.id);
      const ctx = await buildOrgContext(db, { userId: user.id });
      expect(ctx).toEqual({
        kind: "org",
        orgId: org.id,
        actor: { userId: user.id, role: "customer", membershipOrgId: org.id },
      });
    });
  });

  it("returns null for a customer with no membership", async () => {
    await withTransaction(async (db) => {
      const user = await createUser(db, { role: "customer" });
      const ctx = await buildOrgContext(db, { userId: user.id });
      expect(ctx).toBeNull();
    });
  });

  it("returns OrgContext for staff with explicit orgId", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      const ctx = await buildOrgContext(db, { userId: user.id, orgId: org.id });
      expect(ctx).toEqual({
        kind: "org",
        orgId: org.id,
        actor: { userId: user.id, role: "employee", membershipOrgId: null },
      });
    });
  });

  it("returns null for staff without an explicit orgId", async () => {
    await withTransaction(async (db) => {
      const user = await createUser(db, { role: "admin" });
      const ctx = await buildOrgContext(db, { userId: user.id });
      expect(ctx).toBeNull();
    });
  });
});

afterAll(async () => {
  await closePool();
});
