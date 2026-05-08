import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { createFromRequest } from "@/lib/services/tasks";

describe("tasks.createFromRequest", () => {
  it("creates a task with source='from_request' tied to a request id and project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);

      const [request] = await db
        .insert(schema.workRequests)
        .values({
          orgId: org.id,
          submittedBy: admin.id,
          projectId: project.id,
          title: "Help with X",
          status: "submitted",
        })
        .returning();

      const task = await createFromRequest(db, {
        orgId: org.id,
        projectId: project.id,
        title: "Help with X",
        description: "Customer notes",
        priority: "high",
        sourceRequestId: request!.id,
        createdBy: admin.id,
      });

      expect(task.source).toBe("from_request");
      expect(task.sourceRequestId).toBe(request!.id);
      expect(task.projectId).toBe(project.id);
      expect(task.status).toBe("todo");

      const logs = await db
        .select()
        .from(schema.taskStatusLog)
        .where(eq(schema.taskStatusLog.taskId, task.id));
      expect(logs).toHaveLength(1);
      expect(logs[0]!.toStatus).toBe("todo");
    });
  });

  it("supports null projectId (triage queue)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const [request] = await db
        .insert(schema.workRequests)
        .values({
          orgId: org.id,
          submittedBy: admin.id,
          projectId: null,
          title: "General inquiry",
          status: "submitted",
        })
        .returning();

      const task = await createFromRequest(db, {
        orgId: org.id,
        projectId: null,
        title: "General inquiry",
        sourceRequestId: request!.id,
        createdBy: admin.id,
      });

      expect(task.projectId).toBeNull();
      expect(task.source).toBe("from_request");
    });
  });
});

afterAll(async () => {
  await closePool();
});
