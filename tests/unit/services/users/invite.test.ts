import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { inviteUser } from "@/lib/services/users";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("users.inviteUser", () => {
  it("admin invites a customer; invitation row has org + customer system role", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const r = await inviteUser(db, ctxOf(org.id, "admin", admin.id), {
        email: "alice@client.test",
        systemRole: "customer",
        orgId: org.id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.token.length).toBeGreaterThan(20);
      expect(r.data.acceptUrl).toContain(r.data.token);

      const [row] = await db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.id, r.data.id));
      expect(row!.email).toBe("alice@client.test");
      expect(row!.organizationId).toBe(org.id);
      expect(row!.systemRole).toBe("customer");
      expect(row!.inviterId).toBe(admin.id);
      expect(row!.status).toBe("pending");
      expect(new Date(row!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  it("admin invites an employee (orgId is null because staff are global)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const r = await inviteUser(db, ctxOf(org.id, "admin", admin.id), {
        email: "bob@agency.test",
        systemRole: "employee",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const [row] = await db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.id, r.data.id));
      expect(row!.systemRole).toBe("employee");
      expect(row!.organizationId).toBeNull();
    });
  });

  it("validation: customer invite requires orgId", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const r = await inviteUser(db, ctxOf(org.id, "admin", admin.id), {
        email: "bad@x.test",
        systemRole: "customer",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("validation: staff invite must NOT include orgId", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const r = await inviteUser(db, ctxOf(org.id, "admin", admin.id), {
        email: "bad@x.test",
        systemRole: "employee",
        orgId: org.id,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("non-admin cannot invite", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const employee = await createUser(db, { role: "employee" });
      const r = await inviteUser(db, ctxOf(org.id, "employee", employee.id), {
        email: "new@x.test",
        systemRole: "employee",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("rejects when an invitation for the same email is already pending", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const first = await inviteUser(db, ctxOf(org.id, "admin", admin.id), {
        email: "dup@x.test",
        systemRole: "customer",
        orgId: org.id,
      });
      expect(first.ok).toBe(true);
      const second = await inviteUser(db, ctxOf(org.id, "admin", admin.id), {
        email: "dup@x.test",
        systemRole: "customer",
        orgId: org.id,
      });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe("conflict");
    });
  });
});

afterAll(async () => {
  await closePool();
});
