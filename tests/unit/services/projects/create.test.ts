import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createUser, createMembership } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { createProject } from "@/lib/services/projects";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("projects.createProject", () => {
  it("admin can create a project; row has correct fields and defaults", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });

      const result = await createProject(db, ctxOf(org.id, "admin", admin.id), {
        name: "Acme SEO Q3",
        description: "Quarterly SEO retainer",
        serviceType: "seo",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.name).toBe("Acme SEO Q3");
      expect(result.data.serviceType).toBe("seo");
      expect(result.data.status).toBe("draft");
      expect(result.data.orgId).toBe(org.id);
      expect(result.data.createdBy).toBe(admin.id);

      const found = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, result.data.id));
      expect(found).toHaveLength(1);
    });
  });

  it("rejects empty name with validation error + field", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const result = await createProject(db, ctxOf(org.id, "admin", admin.id), {
        name: "",
        serviceType: "seo",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("validation");
        if (result.error.code === "validation") {
          expect(result.error.fields?.name).toBeDefined();
        }
      }
    });
  });

  it("employee cannot create a project (unauthorized)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const employee = await createUser(db, { role: "employee" });
      const result = await createProject(db, ctxOf(org.id, "employee", employee.id), {
        name: "Acme",
        serviceType: "seo",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("unauthorized");
    });
  });

  it("customer cannot create a project (unauthorized)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const result = await createProject(db, ctxOf(org.id, "customer", customer.id), {
        name: "Acme",
        serviceType: "seo",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("unauthorized");
    });
  });

  it("supports optional description, dates, and hourly rate", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const result = await createProject(db, ctxOf(org.id, "admin", admin.id), {
        name: "With dates",
        description: "Has details",
        serviceType: "paid_ads",
        startDate: "2026-06-01",
        endDate: "2026-12-31",
        hourlyRateCents: 25000,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.description).toBe("Has details");
      expect(result.data.startDate).toBe("2026-06-01");
      expect(result.data.endDate).toBe("2026-12-31");
      expect(result.data.hourlyRateCents).toBe(25000);
    });
  });
});

afterAll(async () => {
  await closePool();
});
