import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { acceptInvitation, inviteUser } from "@/lib/services/users";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("users.acceptInvitation", () => {
  it("creates a customer user + member when accepting a customer invite", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const invite = await inviteUser(db, ctxOf(org.id, "admin", admin.id), {
        email: "alice@client.test",
        systemRole: "customer",
        orgId: org.id,
      });
      expect(invite.ok).toBe(true);
      if (!invite.ok) return;

      const r = await acceptInvitation(db, {
        token: invite.data.token,
        password: "Passw0rd!Test123",
        name: "Alice",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.systemRole).toBe("customer");
      expect(r.data.email).toBe("alice@client.test");

      const [member] = await db
        .select()
        .from(schema.members)
        .where(
          and(
            eq(schema.members.userId, r.data.id),
            eq(schema.members.organizationId, org.id),
          ),
        );
      expect(member).toBeDefined();

      const [invRow] = await db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.id, invite.data.id));
      expect(invRow!.status).toBe("accepted");
    });
  });

  it("creates an employee user with no membership when accepting a staff invite", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const invite = await inviteUser(db, ctxOf(org.id, "admin", admin.id), {
        email: "bob@agency.test",
        systemRole: "employee",
      });
      expect(invite.ok).toBe(true);
      if (!invite.ok) return;

      const r = await acceptInvitation(db, {
        token: invite.data.token,
        password: "Passw0rd!Test123",
        name: "Bob",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.systemRole).toBe("employee");

      const members = await db.select().from(schema.members).where(eq(schema.members.userId, r.data.id));
      expect(members).toHaveLength(0);
    });
  });

  it("inserts an account row with the hashed password (so signin verifies)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const invite = await inviteUser(db, ctxOf(org.id, "admin", admin.id), {
        email: "carol@client.test",
        systemRole: "customer",
        orgId: org.id,
      });
      expect(invite.ok).toBe(true);
      if (!invite.ok) return;
      const r = await acceptInvitation(db, {
        token: invite.data.token,
        password: "Passw0rd!Test123",
        name: "Carol",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const accounts = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, r.data.id));
      expect(accounts).toHaveLength(1);
      expect(accounts[0]!.providerId).toBe("credential");
      expect(accounts[0]!.password).toBeTruthy();
      expect(accounts[0]!.password).not.toBe("Passw0rd!Test123");
    });
  });

  it("rejects an invalid token", async () => {
    await withTransaction(async (db) => {
      const r = await acceptInvitation(db, {
        token: "not-a-real-token",
        password: "Passw0rd!Test123",
        name: "Dave",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });

  it("rejects an expired invitation", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const invite = await inviteUser(db, ctxOf(org.id, "admin", admin.id), {
        email: "eve@client.test",
        systemRole: "customer",
        orgId: org.id,
      });
      expect(invite.ok).toBe(true);
      if (!invite.ok) return;
      await db
        .update(schema.invitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.invitations.id, invite.data.id));
      const r = await acceptInvitation(db, {
        token: invite.data.token,
        password: "Passw0rd!Test123",
        name: "Eve",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("conflict");
    });
  });

  it("rejects double-acceptance", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const invite = await inviteUser(db, ctxOf(org.id, "admin", admin.id), {
        email: "frank@client.test",
        systemRole: "customer",
        orgId: org.id,
      });
      expect(invite.ok).toBe(true);
      if (!invite.ok) return;
      const first = await acceptInvitation(db, {
        token: invite.data.token,
        password: "Passw0rd!Test123",
        name: "Frank",
      });
      expect(first.ok).toBe(true);
      const second = await acceptInvitation(db, {
        token: invite.data.token,
        password: "Passw0rd!Test123",
        name: "Frank",
      });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe("conflict");
    });
  });
});

afterAll(async () => {
  await closePool();
});
