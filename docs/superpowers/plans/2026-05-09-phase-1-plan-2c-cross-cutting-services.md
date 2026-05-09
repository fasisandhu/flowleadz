# Phase 1 — Plan 2c: Cross-Cutting Services (Attachments, Notifications API, Invitations)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the three remaining service-layer surfaces — attachments (R2 upload flow), notifications API (read-side: list/markRead/preferences), and user invitations (admin invites customer + staff). All TDD'd against the live Postgres via the existing `withTransaction` fixture, with the R2 client mocked via Vitest module mocking.

**Architecture:** Functional services in `lib/services/<feature>/`. Cross-feature calls go through public APIs only. Attachments use the existing `lib/storage/r2-client.ts` (presigned PUT/GET, HEAD, delete) — Vitest mocks the module at the test boundary. Invitations use Better Auth's `hashPassword` from `better-auth/crypto` to produce password hashes that Better Auth's signin can verify. Email delivery for invitation links remains deferred to Plan 4 (logged to stdout for now, like the magic-link flow).

**Tech Stack:** Drizzle ORM, Vitest (with `vi.mock`), Zod, Better Auth (`hashPassword` + Drizzle adapter), AWS SDK (S3 client / presigner already wired for R2).

**Branch:** Implement on `feat/phase-1-services-cross-cutting`, branched from `main`. Last main commit at start: the Plan-2b merge (`d796712`).

---

## File structure created by this plan

```
lib/services/
  attachments/
    index.ts                       (public API: getUploadUrl, confirm, gcPending, listForParent)
    internal.ts                    (parent-write authorization helper, R2 key builder)
    schemas.ts                     (Zod input shapes + content-type whitelist)
  notifications/
    index.ts                       (extended with listForUser, markRead, upsertPreference)
    schemas.ts                     (extended with list/markRead/preference inputs)
  users/
    index.ts                       (public API: inviteUser, acceptInvitation, listOrgMembers)
    internal.ts                    (token generator, password hashing wrapper)
    schemas.ts                     (Zod input shapes)

tests/unit/services/
  attachments/
    get-upload-url.test.ts
    confirm.test.ts
    gc-pending.test.ts
    list-for-parent.test.ts
  notifications/
    list-for-user.test.ts
    mark-read.test.ts
    preferences.test.ts
  users/
    invite.test.ts
    accept.test.ts
    list-org-members.test.ts
```

---

## Tasks

### Task 1: Attachments — schemas, parent-write helper, R2 key builder

**Files:**
- Create: `lib/services/attachments/schemas.ts`
- Create: `lib/services/attachments/internal.ts`

This task establishes the shared scaffolding for the attachments service before we touch any user-facing function. No test file yet — the helpers are exercised by Tasks 2-5.

- [ ] **Step 1: Schemas**

Create `lib/services/attachments/schemas.ts`:

```ts
import { z } from "zod";
import { idSchema, nonEmptyStringSchema, positiveIntSchema } from "@/lib/services/_schemas/common";

export const attachmentParentTypeEnum = z.enum([
  "daily_update",
  "work_request",
  "task",
  "comment",
]);

export type AttachmentParentType = z.infer<typeof attachmentParentTypeEnum>;

// MIME type whitelist (per spec §8.11).
const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "text/plain",
  "text/csv",
]);

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const getUploadUrlInputSchema = z.object({
  parentType: attachmentParentTypeEnum,
  parentId: idSchema,
  filename: nonEmptyStringSchema.max(255),
  contentType: z.string().refine((s) => ALLOWED_MIME_TYPES.has(s), "Disallowed content type"),
  sizeBytes: positiveIntSchema.max(MAX_SIZE_BYTES, `File exceeds ${MAX_SIZE_BYTES} byte limit`),
});
export type GetUploadUrlInput = z.infer<typeof getUploadUrlInputSchema>;

export const confirmAttachmentInputSchema = z.object({
  id: idSchema,
});
export type ConfirmAttachmentInput = z.infer<typeof confirmAttachmentInputSchema>;

export const listForParentInputSchema = z.object({
  parentType: attachmentParentTypeEnum,
  parentId: idSchema,
});
export type ListForParentInput = z.infer<typeof listForParentInputSchema>;
```

- [ ] **Step 2: Internal helper — parent-write authorization + R2 key builder**

Create `lib/services/attachments/internal.ts`:

```ts
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireTaskWrite } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import type { AttachmentParentType } from "./schemas";

type AnyDb = PgDatabase<any, typeof schema>;

/**
 * Authorize writing an attachment to a parent. Rules per parent type:
 * - daily_update: author or admin
 * - comment: author or admin
 * - task: admin or employee assigned to the project (delegates to requireTaskWrite)
 * - work_request: submitter or admin
 *
 * Returns ok if the actor may attach files to the given parent.
 */
export async function authorizeAttachmentParentWrite(
  db: AnyDb,
  ctx: OrgContext,
  parentType: AttachmentParentType,
  parentId: string,
): Promise<Result<true>> {
  switch (parentType) {
    case "daily_update": {
      const [row] = await db
        .select({
          id: schema.dailyUpdates.id,
          orgId: schema.dailyUpdates.orgId,
          userId: schema.dailyUpdates.userId,
        })
        .from(schema.dailyUpdates)
        .where(eq(schema.dailyUpdates.id, parentId))
        .limit(1);
      if (!row) return err("not_found", "Parent not found");
      if (row.orgId !== ctx.orgId) return err("not_found", "Parent not found");
      if (ctx.actor.role !== "admin" && row.userId !== ctx.actor.userId) {
        return err("unauthorized", "Only the author or an admin can attach files to this update");
      }
      return ok(true);
    }
    case "comment": {
      const [row] = await db
        .select({
          id: schema.comments.id,
          orgId: schema.comments.orgId,
          userId: schema.comments.userId,
          deletedAt: schema.comments.deletedAt,
        })
        .from(schema.comments)
        .where(eq(schema.comments.id, parentId))
        .limit(1);
      if (!row) return err("not_found", "Parent not found");
      if (row.orgId !== ctx.orgId) return err("not_found", "Parent not found");
      if (row.deletedAt) return err("not_found", "Parent not found");
      if (ctx.actor.role !== "admin" && row.userId !== ctx.actor.userId) {
        return err("unauthorized", "Only the author or an admin can attach files to this comment");
      }
      return ok(true);
    }
    case "task":
      return requireTaskWrite(db, ctx, parentId);
    case "work_request": {
      const [row] = await db
        .select({
          id: schema.workRequests.id,
          orgId: schema.workRequests.orgId,
          submittedBy: schema.workRequests.submittedBy,
        })
        .from(schema.workRequests)
        .where(eq(schema.workRequests.id, parentId))
        .limit(1);
      if (!row) return err("not_found", "Parent not found");
      if (row.orgId !== ctx.orgId) return err("not_found", "Parent not found");
      if (ctx.actor.role !== "admin" && row.submittedBy !== ctx.actor.userId) {
        return err("unauthorized", "Only the submitter or an admin can attach files to this request");
      }
      return ok(true);
    }
  }
}

/**
 * Authorize READING attachments on a parent. Read is broader than write
 * (e.g., a customer can see attachments on a customer_visible daily update
 * even if they didn't author it). Returns ok if the actor can read the parent.
 */
export async function authorizeAttachmentParentRead(
  db: AnyDb,
  ctx: OrgContext,
  parentType: AttachmentParentType,
  parentId: string,
): Promise<Result<true>> {
  // Lazy imports to avoid pulling auth predicates not yet referenced at top of file.
  const { requireDailyUpdateRead, requireTaskRead, requireOrgAccess } = await import(
    "@/lib/services/_auth/predicates"
  );
  switch (parentType) {
    case "daily_update":
      return requireDailyUpdateRead(db, ctx, parentId);
    case "task":
      return requireTaskRead(db, ctx, parentId);
    case "comment": {
      // Comment read = parent daily-update read.
      const [row] = await db
        .select({
          id: schema.comments.id,
          orgId: schema.comments.orgId,
          dailyUpdateId: schema.comments.dailyUpdateId,
        })
        .from(schema.comments)
        .where(eq(schema.comments.id, parentId))
        .limit(1);
      if (!row) return err("not_found", "Parent not found");
      if (row.orgId !== ctx.orgId) return err("not_found", "Parent not found");
      return requireDailyUpdateRead(db, ctx, row.dailyUpdateId);
    }
    case "work_request": {
      // Anyone in the org with org access can see the request (customer sees own;
      // admin sees all; employee sees assigned + triage). Match listWorkRequests
      // visibility: simplest is — customer must be in the org and must be the
      // submitter; staff (admin or employee) just need org access.
      const [row] = await db
        .select({
          id: schema.workRequests.id,
          orgId: schema.workRequests.orgId,
          submittedBy: schema.workRequests.submittedBy,
        })
        .from(schema.workRequests)
        .where(eq(schema.workRequests.id, parentId))
        .limit(1);
      if (!row) return err("not_found", "Parent not found");
      if (row.orgId !== ctx.orgId) return err("not_found", "Parent not found");
      if (ctx.actor.role === "customer" && row.submittedBy !== ctx.actor.userId) {
        return err("unauthorized", "Customers can only see their own requests");
      }
      return requireOrgAccess(db, ctx);
    }
  }
}

/**
 * Deterministic R2 key for an attachment. Layout: {orgId}/{parentType}/{attachmentId}/{filename}.
 * Filename is preserved (not URL-encoded) so the customer's download retains the original name;
 * R2 handles arbitrary key bytes.
 */
export function buildR2Key(
  orgId: string,
  parentType: AttachmentParentType,
  attachmentId: string,
  filename: string,
): string {
  return `${orgId}/${parentType}/${attachmentId}/${filename}`;
}
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm lint && pnpm build
```
All must pass. No tests added in this task — internal helpers are exercised by subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git checkout -b feat/phase-1-services-cross-cutting
git add lib/services/attachments
git commit -m "feat(services): attachments scaffolding (schemas, parent-write/read helpers, R2 key)"
```

---

### Task 2: attachments.getUploadUrl

**Files:**
- Create: `lib/services/attachments/index.ts`
- Create: `tests/unit/services/attachments/get-upload-url.test.ts`

The test mocks `@/lib/storage/r2-client` so we can assert the call args without hitting real R2. The function inserts a `pending` row with a deterministic `r2_key` and returns `{ uploadUrl, attachmentId, r2Key }`.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/attachments/get-upload-url.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import {
  createMembership,
  createOrg,
  createProject,
  createTask,
  createUser,
} from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import type { OrgContext } from "@/lib/services/_context";

// Mock R2 client BEFORE importing the service.
vi.mock("@/lib/storage/r2-client", () => ({
  presignPut: vi.fn(async () => "https://r2.example.com/signed-put-url"),
  presignGet: vi.fn(),
  headObject: vi.fn(),
  deleteObject: vi.fn(),
}));

import { presignPut } from "@/lib/storage/r2-client";
import { getUploadUrl } from "@/lib/services/attachments";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

beforeEach(() => {
  vi.mocked(presignPut).mockClear();
  vi.mocked(presignPut).mockResolvedValue("https://r2.example.com/signed-put-url");
});

describe("attachments.getUploadUrl", () => {
  it("admin can request upload URL for a daily_update they wrote; pending row inserted", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "x",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();

      const r = await getUploadUrl(db, ctxOf(org.id, "admin", admin.id), {
        parentType: "daily_update",
        parentId: update!.id,
        filename: "screenshot.png",
        contentType: "image/png",
        sizeBytes: 12345,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.uploadUrl).toBe("https://r2.example.com/signed-put-url");
      expect(r.data.r2Key).toMatch(new RegExp(`^${org.id}/daily_update/[^/]+/screenshot\\.png$`));

      const rows = await db
        .select()
        .from(schema.attachments)
        .where(eq(schema.attachments.id, r.data.attachmentId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe("pending");
      expect(rows[0]!.parentType).toBe("daily_update");
      expect(rows[0]!.parentId).toBe(update!.id);
      expect(rows[0]!.filename).toBe("screenshot.png");
      expect(rows[0]!.contentType).toBe("image/png");
      expect(Number(rows[0]!.sizeBytes)).toBe(12345);
      expect(rows[0]!.uploadedBy).toBe(admin.id);

      // R2 was called with our key + content type + size.
      expect(presignPut).toHaveBeenCalledTimes(1);
      const [keyArg, ctArg, sizeArg] = vi.mocked(presignPut).mock.calls[0]!;
      expect(keyArg).toBe(rows[0]!.r2Key);
      expect(ctArg).toBe("image/png");
      expect(sizeArg).toBe(12345);
    });
  });

  it("customer can attach to their own work_request; non-submitter cannot", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const c1 = await createUser(db, { role: "customer" });
      const c2 = await createUser(db, { role: "customer" });
      await createMembership(db, c1.id, org.id);
      await createMembership(db, c2.id, org.id);
      const [request] = await db
        .insert(schema.workRequests)
        .values({
          orgId: org.id,
          submittedBy: c1.id,
          title: "wr",
          status: "submitted",
        })
        .returning();

      const ok1 = await getUploadUrl(db, ctxOf(org.id, "customer", c1.id), {
        parentType: "work_request",
        parentId: request!.id,
        filename: "spec.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
      });
      expect(ok1.ok).toBe(true);

      const blocked = await getUploadUrl(db, ctxOf(org.id, "customer", c2.id), {
        parentType: "work_request",
        parentId: request!.id,
        filename: "spec.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
      });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.error.code).toBe("unauthorized");
    });
  });

  it("rejects disallowed content type", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await getUploadUrl(db, ctxOf(org.id, "admin", admin.id), {
        parentType: "task",
        parentId: task.id,
        filename: "evil.exe",
        contentType: "application/x-msdownload",
        sizeBytes: 1024,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("rejects oversized files", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await getUploadUrl(db, ctxOf(org.id, "admin", admin.id), {
        parentType: "task",
        parentId: task.id,
        filename: "big.pdf",
        contentType: "application/pdf",
        sizeBytes: 100 * 1024 * 1024,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("not_found if parent in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const task = await createTask(db, orgB.id, project.id, admin.id);
      const r = await getUploadUrl(db, ctxOf(orgA.id, "admin", admin.id), {
        parentType: "task",
        parentId: task.id,
        filename: "x.pdf",
        contentType: "application/pdf",
        sizeBytes: 100,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/attachments/get-upload-url.test.ts
```
Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Implement**

Create `lib/services/attachments/index.ts`:

```ts
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import type { OrgContext } from "@/lib/services/_context";
import { presignPut } from "@/lib/storage/r2-client";
import {
  getUploadUrlInputSchema,
  type GetUploadUrlInput,
} from "./schemas";
import { authorizeAttachmentParentWrite, buildR2Key } from "./internal";

type AnyDb = PgDatabase<any, typeof schema>;
type Attachment = typeof schema.attachments.$inferSelect;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export type GetUploadUrlResult = {
  attachmentId: string;
  uploadUrl: string;
  r2Key: string;
};

export async function getUploadUrl(
  db: AnyDb,
  ctx: OrgContext,
  input: GetUploadUrlInput,
): Promise<Result<GetUploadUrlResult>> {
  const parsed = getUploadUrlInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const auth = await authorizeAttachmentParentWrite(
    db,
    ctx,
    parsed.data.parentType,
    parsed.data.parentId,
  );
  if (!auth.ok) return auth;

  // Insert pending row first so we can use its UUID v7 in the r2 key.
  const [row] = await db
    .insert(schema.attachments)
    .values({
      orgId: ctx.orgId,
      parentType: parsed.data.parentType,
      parentId: parsed.data.parentId,
      uploadedBy: ctx.actor.userId,
      r2Key: "pending", // placeholder — we update with the real key below
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.sizeBytes,
      status: "pending",
    })
    .returning();

  const r2Key = buildR2Key(
    ctx.orgId,
    parsed.data.parentType,
    row!.id,
    parsed.data.filename,
  );

  await db
    .update(schema.attachments)
    .set({ r2Key })
    .where(eq(schema.attachments.id, row!.id));

  const uploadUrl = await presignPut(r2Key, parsed.data.contentType, parsed.data.sizeBytes);

  return ok({ attachmentId: row!.id, uploadUrl, r2Key });
}
```

- [ ] **Step 4: GREEN + commit**

```bash
pnpm test tests/unit/services/attachments/get-upload-url.test.ts
pnpm test
git add lib/services/attachments tests/unit/services/attachments/get-upload-url.test.ts
git commit -m "feat(services): attachments.getUploadUrl (presign + pending insert)"
```

Expected: 5 new tests pass; project total ~175.

---

### Task 3: attachments.confirm (HEAD verify + ready flip)

**Files:**
- Modify: `lib/services/attachments/index.ts`
- Create: `tests/unit/services/attachments/confirm.test.ts`

`confirm` is called by the client after successfully PUTting the file to R2. The service does a HEAD on R2 to verify the object exists at the expected size, then flips status to `ready`. If HEAD fails (object missing) or size mismatches, marks `failed`.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/attachments/confirm.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createTask, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import type { OrgContext } from "@/lib/services/_context";

vi.mock("@/lib/storage/r2-client", () => ({
  presignPut: vi.fn(async () => "https://r2.example.com/u"),
  presignGet: vi.fn(),
  headObject: vi.fn(),
  deleteObject: vi.fn(),
}));

import { headObject } from "@/lib/storage/r2-client";
import { confirm, getUploadUrl } from "@/lib/services/attachments";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

beforeEach(() => {
  vi.mocked(headObject).mockReset();
});

async function seedPendingAttachment(
  db: Parameters<typeof createUser>[0],
  ctx: OrgContext,
  parentId: string,
): Promise<string> {
  const r = await getUploadUrl(db, ctx, {
    parentType: "task",
    parentId,
    filename: "x.pdf",
    contentType: "application/pdf",
    sizeBytes: 100,
  });
  if (!r.ok) throw new Error("setup failed");
  return r.data.attachmentId;
}

describe("attachments.confirm", () => {
  it("flips pending -> ready when HEAD returns matching size", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const id = await seedPendingAttachment(db, ctxOf(org.id, "admin", admin.id), task.id);

      vi.mocked(headObject).mockResolvedValueOnce({ ContentLength: 100 } as never);

      const r = await confirm(db, ctxOf(org.id, "admin", admin.id), { id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("ready");
      expect(r.data.confirmedAt).not.toBeNull();
    });
  });

  it("flips to failed when HEAD throws (object missing)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const id = await seedPendingAttachment(db, ctxOf(org.id, "admin", admin.id), task.id);

      vi.mocked(headObject).mockRejectedValueOnce(new Error("NotFound"));

      const r = await confirm(db, ctxOf(org.id, "admin", admin.id), { id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");

      const [row] = await db
        .select()
        .from(schema.attachments)
        .where(eq(schema.attachments.id, id));
      expect(row!.status).toBe("failed");
    });
  });

  it("flips to failed on size mismatch", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const id = await seedPendingAttachment(db, ctxOf(org.id, "admin", admin.id), task.id);

      vi.mocked(headObject).mockResolvedValueOnce({ ContentLength: 999 } as never);

      const r = await confirm(db, ctxOf(org.id, "admin", admin.id), { id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");

      const [row] = await db
        .select()
        .from(schema.attachments)
        .where(eq(schema.attachments.id, id));
      expect(row!.status).toBe("failed");
    });
  });

  it("only the uploader or admin can confirm; cross-user employee blocked", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const e1 = await createUser(db, { role: "employee" });
      const e2 = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      // Assign both employees so authorizeAttachmentParentWrite passes for the upload step.
      await db.insert(schema.projectAssignments).values({ userId: e1.id, projectId: project.id });
      await db.insert(schema.projectAssignments).values({ userId: e2.id, projectId: project.id });
      const id = await seedPendingAttachment(db, ctxOf(org.id, "employee", e1.id), task.id);

      const r = await confirm(db, ctxOf(org.id, "employee", e2.id), { id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("not_found if attachment is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const task = await createTask(db, orgB.id, project.id, admin.id);
      const id = await seedPendingAttachment(db, ctxOf(orgB.id, "admin", admin.id), task.id);

      const r = await confirm(db, ctxOf(orgA.id, "admin", admin.id), { id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/attachments/confirm.test.ts
```

- [ ] **Step 3: Implement**

Append to `lib/services/attachments/index.ts`:

```ts
import { headObject } from "@/lib/storage/r2-client";
import { confirmAttachmentInputSchema, type ConfirmAttachmentInput } from "./schemas";

export async function confirm(
  db: AnyDb,
  ctx: OrgContext,
  input: ConfirmAttachmentInput,
): Promise<Result<Attachment>> {
  const parsed = confirmAttachmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const [existing] = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.id, parsed.data.id))
    .limit(1);
  if (!existing) return err("not_found", "Attachment not found");
  if (existing.orgId !== ctx.orgId) return err("not_found", "Attachment not found");

  if (ctx.actor.role !== "admin" && existing.uploadedBy !== ctx.actor.userId) {
    return err("unauthorized", "Only the uploader or an admin can confirm this attachment");
  }

  // Idempotent on already-ready.
  if (existing.status === "ready") return ok(existing);

  // HEAD R2 to verify the object exists at the expected size.
  let head: { ContentLength?: number };
  try {
    head = await headObject(existing.r2Key);
  } catch {
    await db
      .update(schema.attachments)
      .set({ status: "failed" })
      .where(eq(schema.attachments.id, parsed.data.id));
    return err("not_found", "Object not found in R2");
  }

  const expectedSize = Number(existing.sizeBytes);
  if (head.ContentLength !== expectedSize) {
    await db
      .update(schema.attachments)
      .set({ status: "failed" })
      .where(eq(schema.attachments.id, parsed.data.id));
    return err("validation", `Size mismatch: expected ${expectedSize}, got ${head.ContentLength}`);
  }

  const [row] = await db
    .update(schema.attachments)
    .set({ status: "ready", confirmedAt: new Date() })
    .where(eq(schema.attachments.id, parsed.data.id))
    .returning();
  return ok(row!);
}
```

- [ ] **Step 4: GREEN + commit**

```bash
pnpm test tests/unit/services/attachments/confirm.test.ts
pnpm test
git add lib/services/attachments tests/unit/services/attachments/confirm.test.ts
git commit -m "feat(services): attachments.confirm (HEAD verify + ready/failed flip)"
```

---

### Task 4: attachments.gcPending (cron handler)

**Files:**
- Modify: `lib/services/attachments/index.ts`
- Create: `tests/unit/services/attachments/gc-pending.test.ts`

Deletes pending rows older than 1 hour and tries to clean up the corresponding R2 objects (best-effort — failures are logged but don't block). Called by the daily cron at `/api/cron/gc-pending`.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/attachments/gc-pending.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createTask, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";

vi.mock("@/lib/storage/r2-client", () => ({
  presignPut: vi.fn(),
  presignGet: vi.fn(),
  headObject: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
}));

import { deleteObject } from "@/lib/storage/r2-client";
import { gcPending } from "@/lib/services/attachments";

beforeEach(() => {
  vi.mocked(deleteObject).mockClear();
  vi.mocked(deleteObject).mockResolvedValue(undefined as never);
});

async function seedAttachment(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  parentId: string,
  uploadedBy: string,
  status: "pending" | "ready",
  createdAtOffsetMs: number,
) {
  const [row] = await db
    .insert(schema.attachments)
    .values({
      orgId,
      parentType: "task",
      parentId,
      uploadedBy,
      r2Key: `${orgId}/task/${Math.random()}/x.pdf`,
      filename: "x.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      status,
      createdAt: new Date(Date.now() + createdAtOffsetMs),
    })
    .returning();
  return row!;
}

describe("attachments.gcPending", () => {
  it("deletes pending rows older than 1 hour and calls R2 deleteObject; leaves ready rows alone", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);

      // Old pending (2 hours ago) → should be deleted.
      const old = await seedAttachment(db, org.id, task.id, admin.id, "pending", -2 * 60 * 60 * 1000);
      // Recent pending (10 minutes ago) → should be kept.
      const recent = await seedAttachment(db, org.id, task.id, admin.id, "pending", -10 * 60 * 1000);
      // Old ready → should be kept.
      const oldReady = await seedAttachment(db, org.id, task.id, admin.id, "ready", -2 * 60 * 60 * 1000);

      const r = await gcPending(db);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.deleted).toBe(1);

      const remaining = await db.select().from(schema.attachments);
      const ids = remaining.map((row) => row.id).sort();
      expect(ids).toEqual([recent.id, oldReady.id].sort());

      // R2 deleteObject called once with the old pending row's key.
      expect(deleteObject).toHaveBeenCalledTimes(1);
      expect(vi.mocked(deleteObject).mock.calls[0]![0]).toBe(old.r2Key);
    });
  });

  it("returns deleted=0 when nothing is stale", async () => {
    await withTransaction(async (db) => {
      const r = await gcPending(db);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.deleted).toBe(0);
      expect(deleteObject).not.toHaveBeenCalled();
    });
  });

  it("continues if R2 delete throws (best-effort)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      await seedAttachment(db, org.id, task.id, admin.id, "pending", -2 * 60 * 60 * 1000);

      vi.mocked(deleteObject).mockRejectedValueOnce(new Error("R2 down"));

      const r = await gcPending(db);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // DB row still deleted even though R2 delete failed.
      expect(r.data.deleted).toBe(1);
      const remaining = await db.select().from(schema.attachments);
      expect(remaining).toHaveLength(0);
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/attachments/gc-pending.test.ts
```

- [ ] **Step 3: Implement**

Append to `lib/services/attachments/index.ts`:

```ts
import { and, lt } from "drizzle-orm";
import { deleteObject } from "@/lib/storage/r2-client";
import { log } from "@/lib/log";

export async function gcPending(db: AnyDb): Promise<Result<{ deleted: number }>> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

  const stale = await db
    .select({ id: schema.attachments.id, r2Key: schema.attachments.r2Key })
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.status, "pending"),
        lt(schema.attachments.createdAt, cutoff),
      ),
    );

  if (stale.length === 0) return ok({ deleted: 0 });

  // Best-effort R2 cleanup. We continue on per-object errors so a single bad
  // object doesn't block GC of the rest.
  for (const row of stale) {
    try {
      await deleteObject(row.r2Key);
    } catch (e) {
      log.warn({ err: e, r2Key: row.r2Key }, "gcPending: R2 deleteObject failed (continuing)");
    }
  }

  // Now delete the DB rows.
  const ids = stale.map((row) => row.id);
  // drizzle's inArray with empty array would error, but we already returned early.
  const { inArray } = await import("drizzle-orm");
  await db.delete(schema.attachments).where(inArray(schema.attachments.id, ids));

  return ok({ deleted: stale.length });
}
```

- [ ] **Step 4: GREEN + commit**

```bash
pnpm test tests/unit/services/attachments/gc-pending.test.ts
pnpm test
git add lib/services/attachments tests/unit/services/attachments/gc-pending.test.ts
git commit -m "feat(services): attachments.gcPending (delete pending > 1hr + R2 cleanup)"
```

---

### Task 5: attachments.listForParent

**Files:**
- Modify: `lib/services/attachments/index.ts`
- Create: `tests/unit/services/attachments/list-for-parent.test.ts`

Returns ready attachments for a given parent. Authorization via `authorizeAttachmentParentRead`. Pending/failed rows excluded.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/attachments/list-for-parent.test.ts`:

```ts
import { afterAll, describe, expect, it, vi } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import type { OrgContext } from "@/lib/services/_context";

vi.mock("@/lib/storage/r2-client", () => ({
  presignPut: vi.fn(),
  presignGet: vi.fn(),
  headObject: vi.fn(),
  deleteObject: vi.fn(),
}));

import { listForParent } from "@/lib/services/attachments";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedAttachment(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  parentType: "daily_update" | "task" | "comment" | "work_request",
  parentId: string,
  uploadedBy: string,
  filename: string,
  status: "pending" | "ready" | "failed" = "ready",
) {
  const [row] = await db
    .insert(schema.attachments)
    .values({
      orgId,
      parentType,
      parentId,
      uploadedBy,
      r2Key: `${orgId}/${parentType}/${Math.random()}/${filename}`,
      filename,
      contentType: "application/pdf",
      sizeBytes: 100,
      status,
    })
    .returning();
  return row!;
}

describe("attachments.listForParent", () => {
  it("returns ready attachments, excluding pending and failed", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      await seedAttachment(db, org.id, "daily_update", update!.id, admin.id, "ready.pdf", "ready");
      await seedAttachment(db, org.id, "daily_update", update!.id, admin.id, "pending.pdf", "pending");
      await seedAttachment(db, org.id, "daily_update", update!.id, admin.id, "failed.pdf", "failed");

      const r = await listForParent(db, ctxOf(org.id, "admin", admin.id), {
        parentType: "daily_update",
        parentId: update!.id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((a) => a.filename)).toEqual(["ready.pdf"]);
    });
  });

  it("customer can list ready attachments on a customer_visible update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      await seedAttachment(db, org.id, "daily_update", update!.id, admin.id, "shared.pdf");

      const r = await listForParent(db, ctxOf(org.id, "customer", customer.id), {
        parentType: "daily_update",
        parentId: update!.id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(1);
    });
  });

  it("customer cannot list attachments on internal_only updates", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "internal_only",
          logDate: "2026-05-08",
        })
        .returning();
      await seedAttachment(db, org.id, "daily_update", update!.id, admin.id, "secret.pdf");

      const r = await listForParent(db, ctxOf(org.id, "customer", customer.id), {
        parentType: "daily_update",
        parentId: update!.id,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/attachments/list-for-parent.test.ts
```

- [ ] **Step 3: Implement**

Append to `lib/services/attachments/index.ts`:

```ts
import { authorizeAttachmentParentRead } from "./internal";
import { listForParentInputSchema, type ListForParentInput } from "./schemas";

export async function listForParent(
  db: AnyDb,
  ctx: OrgContext,
  input: ListForParentInput,
): Promise<Result<Attachment[]>> {
  const parsed = listForParentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const auth = await authorizeAttachmentParentRead(
    db,
    ctx,
    parsed.data.parentType,
    parsed.data.parentId,
  );
  if (!auth.ok) return auth;

  const rows = await db
    .select()
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.parentType, parsed.data.parentType),
        eq(schema.attachments.parentId, parsed.data.parentId),
        eq(schema.attachments.status, "ready"),
      ),
    )
    .orderBy(schema.attachments.createdAt);
  return ok(rows);
}
```

- [ ] **Step 4: GREEN + commit**

```bash
pnpm test tests/unit/services/attachments/list-for-parent.test.ts
pnpm test
git add lib/services/attachments tests/unit/services/attachments/list-for-parent.test.ts
git commit -m "feat(services): attachments.listForParent (ready only, parent-read auth)"
```

---

### Task 6: notifications.listForUser (read-side)

**Files:**
- Modify: `lib/services/notifications/index.ts`
- Modify: `lib/services/notifications/schemas.ts`
- Create: `tests/unit/services/notifications/list-for-user.test.ts`

Returns notifications for the current user, optionally filtered by read/unread, paginated by `limit + offset`.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/notifications/list-for-user.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { listForUser } from "@/lib/services/notifications";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedNotification(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  userId: string,
  eventType: string,
  read: boolean = false,
  createdAtOffsetMs: number = 0,
) {
  const [row] = await db
    .insert(schema.notifications)
    .values({
      orgId,
      userId,
      eventType,
      payload: { foo: "bar" },
      readAt: read ? new Date() : null,
      createdAt: new Date(Date.now() + createdAtOffsetMs),
    })
    .returning();
  return row!;
}

describe("notifications.listForUser", () => {
  it("returns the user's notifications newest-first", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      await seedNotification(db, org.id, user.id, "task.assigned", false, -2000);
      await seedNotification(db, org.id, user.id, "task.assigned", false, -1000);
      await seedNotification(db, org.id, user.id, "task.assigned", false, 0);

      const r = await listForUser(db, ctxOf(org.id, "employee", user.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.notifications).toHaveLength(3);
      // Newest first by createdAt.
      expect(
        new Date(r.data.notifications[0]!.createdAt).getTime(),
      ).toBeGreaterThanOrEqual(
        new Date(r.data.notifications[1]!.createdAt).getTime(),
      );
    });
  });

  it("filters to unread only when filter='unread'", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      await seedNotification(db, org.id, user.id, "task.assigned", true);
      await seedNotification(db, org.id, user.id, "task.assigned", false);

      const r = await listForUser(db, ctxOf(org.id, "employee", user.id), { filter: "unread" });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.notifications).toHaveLength(1);
      expect(r.data.notifications[0]!.readAt).toBeNull();
    });
  });

  it("returns unread count even when listing all", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      await seedNotification(db, org.id, user.id, "task.assigned", true);
      await seedNotification(db, org.id, user.id, "task.assigned", false);
      await seedNotification(db, org.id, user.id, "task.assigned", false);

      const r = await listForUser(db, ctxOf(org.id, "employee", user.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.unreadCount).toBe(2);
      expect(r.data.notifications).toHaveLength(3);
    });
  });

  it("only returns the actor's notifications, not other users", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const me = await createUser(db, { role: "employee" });
      const other = await createUser(db, { role: "employee" });
      await seedNotification(db, org.id, me.id, "task.assigned");
      await seedNotification(db, org.id, other.id, "task.assigned");

      const r = await listForUser(db, ctxOf(org.id, "employee", me.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.notifications).toHaveLength(1);
      expect(r.data.notifications[0]!.userId).toBe(me.id);
    });
  });

  it("respects limit + offset", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      for (let i = 0; i < 5; i++) {
        await seedNotification(db, org.id, user.id, "task.assigned", false, -i * 1000);
      }
      const r = await listForUser(db, ctxOf(org.id, "employee", user.id), { limit: 2, offset: 1 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.notifications).toHaveLength(2);
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/notifications/list-for-user.test.ts
```

- [ ] **Step 3: Schema additions**

Append to `lib/services/notifications/schemas.ts`:

```ts
export const listForUserInputSchema = z.object({
  filter: z.enum(["all", "unread"]).optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type ListForUserInput = z.infer<typeof listForUserInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/notifications/index.ts`:

```ts
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { err, ok, type Result } from "@/lib/services/_result";
import type { OrgContext } from "@/lib/services/_context";
import { listForUserInputSchema, type ListForUserInput } from "./schemas";

type Notification = typeof schema.notifications.$inferSelect;

export type ListForUserResult = {
  notifications: Notification[];
  unreadCount: number;
};

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function listForUser(
  db: AnyDb,
  ctx: OrgContext,
  input: ListForUserInput,
): Promise<Result<ListForUserResult>> {
  const parsed = listForUserInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const conditions = [eq(schema.notifications.userId, ctx.actor.userId)];
  if (parsed.data.filter === "unread") {
    conditions.push(isNull(schema.notifications.readAt));
  }

  const rowsQuery = db
    .select()
    .from(schema.notifications)
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(parsed.data.limit ?? 50)
    .offset(parsed.data.offset ?? 0);

  const unreadQuery = db
    .select({ value: count() })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, ctx.actor.userId),
        isNull(schema.notifications.readAt),
      ),
    );

  const [notifications, unreadCountRows] = await Promise.all([rowsQuery, unreadQuery]);
  const unreadCount = Number(unreadCountRows[0]?.value ?? 0);

  return ok({ notifications, unreadCount });
}
```

Note: `count()` from drizzle-orm v0.45+ is the recommended count helper; if your version is older, fall back to `sql<number>\`count(*)\``.

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/notifications/list-for-user.test.ts
pnpm test
git add lib/services/notifications tests/unit/services/notifications/list-for-user.test.ts
git commit -m "feat(services): notifications.listForUser with unread count + filter + paging"
```

---

### Task 7: notifications.markRead (single + bulk)

**Files:**
- Modify: `lib/services/notifications/index.ts`
- Modify: `lib/services/notifications/schemas.ts`
- Create: `tests/unit/services/notifications/mark-read.test.ts`

`markRead` accepts an array of notification IDs (length 1+) and sets `readAt` for any of those that belong to the actor + are still unread. Returns the count actually flipped.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/notifications/mark-read.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { markRead } from "@/lib/services/notifications";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedNotification(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  userId: string,
) {
  const [row] = await db
    .insert(schema.notifications)
    .values({
      orgId,
      userId,
      eventType: "task.assigned",
      payload: {},
    })
    .returning();
  return row!;
}

describe("notifications.markRead", () => {
  it("flips a single unread notification to read", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      const n = await seedNotification(db, org.id, user.id);

      const r = await markRead(db, ctxOf(org.id, "employee", user.id), { ids: [n.id] });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.markedCount).toBe(1);

      const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, n.id));
      expect(row!.readAt).not.toBeNull();
    });
  });

  it("bulk marks multiple in one call", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      const n1 = await seedNotification(db, org.id, user.id);
      const n2 = await seedNotification(db, org.id, user.id);

      const r = await markRead(db, ctxOf(org.id, "employee", user.id), { ids: [n1.id, n2.id] });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.markedCount).toBe(2);
    });
  });

  it("does not flip notifications belonging to another user (markedCount=0)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const me = await createUser(db, { role: "employee" });
      const other = await createUser(db, { role: "employee" });
      const n = await seedNotification(db, org.id, other.id);

      const r = await markRead(db, ctxOf(org.id, "employee", me.id), { ids: [n.id] });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.markedCount).toBe(0);

      const [row] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, n.id));
      expect(row!.readAt).toBeNull();
    });
  });

  it("idempotent on already-read notifications", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      const n = await seedNotification(db, org.id, user.id);
      await markRead(db, ctxOf(org.id, "employee", user.id), { ids: [n.id] });
      const r = await markRead(db, ctxOf(org.id, "employee", user.id), { ids: [n.id] });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // Second call: nothing flipped (already read).
      expect(r.data.markedCount).toBe(0);
    });
  });

  it("rejects empty ids array", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      const r = await markRead(db, ctxOf(org.id, "employee", user.id), { ids: [] });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/notifications/mark-read.test.ts
```

- [ ] **Step 3: Schema**

Append to `lib/services/notifications/schemas.ts`:

```ts
import { idSchema } from "@/lib/services/_schemas/common";

export const markReadInputSchema = z.object({
  ids: z.array(idSchema).min(1, "At least one id is required"),
});
export type MarkReadInput = z.infer<typeof markReadInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/notifications/index.ts`:

```ts
import { inArray } from "drizzle-orm";
import { markReadInputSchema, type MarkReadInput } from "./schemas";

export async function markRead(
  db: AnyDb,
  ctx: OrgContext,
  input: MarkReadInput,
): Promise<Result<{ markedCount: number }>> {
  const parsed = markReadInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const result = await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        inArray(schema.notifications.id, parsed.data.ids),
        eq(schema.notifications.userId, ctx.actor.userId),
        isNull(schema.notifications.readAt),
      ),
    )
    .returning({ id: schema.notifications.id });

  return ok({ markedCount: result.length });
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/notifications/mark-read.test.ts
pnpm test
git add lib/services/notifications tests/unit/services/notifications/mark-read.test.ts
git commit -m "feat(services): notifications.markRead (bulk, scoped to actor)"
```

---

### Task 8: notifications.upsertPreference (per-user override + admin org default)

**Files:**
- Modify: `lib/services/notifications/index.ts`
- Modify: `lib/services/notifications/schemas.ts`
- Create: `tests/unit/services/notifications/preferences.test.ts`

`upsertPreference` writes to `notification_preferences`. Two modes:
- **User override** (default): writes a row with `user_id = ctx.actor.userId`. Customers, employees, admins can all do this for themselves.
- **Org default** (admin only, opt-in via `target: 'org'`): writes a row with `user_id = null`.

Same `(eventType, in_app_enabled, email_enabled)` payload either way.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/notifications/preferences.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { upsertPreference } from "@/lib/services/notifications";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("notifications.upsertPreference", () => {
  it("user can set their own preference", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "customer" });
      await createMembership(db, user.id, org.id);

      const r = await upsertPreference(db, ctxOf(org.id, "customer", user.id), {
        eventType: "task.status_changed",
        inAppEnabled: false,
        emailEnabled: true,
      });
      expect(r.ok).toBe(true);

      const rows = await db
        .select()
        .from(schema.notificationPreferences)
        .where(
          and(
            eq(schema.notificationPreferences.userId, user.id),
            eq(schema.notificationPreferences.eventType, "task.status_changed"),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.inAppEnabled).toBe(false);
      expect(rows[0]!.emailEnabled).toBe(true);
    });
  });

  it("upsert: second call overwrites the same row", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });

      await upsertPreference(db, ctxOf(org.id, "employee", user.id), {
        eventType: "task.assigned",
        inAppEnabled: true,
        emailEnabled: true,
      });
      await upsertPreference(db, ctxOf(org.id, "employee", user.id), {
        eventType: "task.assigned",
        inAppEnabled: false,
        emailEnabled: false,
      });

      const rows = await db
        .select()
        .from(schema.notificationPreferences)
        .where(eq(schema.notificationPreferences.userId, user.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.inAppEnabled).toBe(false);
      expect(rows[0]!.emailEnabled).toBe(false);
    });
  });

  it("admin can set the org default with target='org' (user_id is null)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });

      const r = await upsertPreference(db, ctxOf(org.id, "admin", admin.id), {
        target: "org",
        eventType: "comment.posted",
        inAppEnabled: true,
        emailEnabled: false,
      });
      expect(r.ok).toBe(true);

      const rows = await db
        .select()
        .from(schema.notificationPreferences)
        .where(
          and(
            isNull(schema.notificationPreferences.userId),
            eq(schema.notificationPreferences.eventType, "comment.posted"),
            eq(schema.notificationPreferences.orgId, org.id),
          ),
        );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.emailEnabled).toBe(false);
    });
  });

  it("non-admin cannot set the org default", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const employee = await createUser(db, { role: "employee" });
      const r = await upsertPreference(db, ctxOf(org.id, "employee", employee.id), {
        target: "org",
        eventType: "comment.posted",
        inAppEnabled: true,
        emailEnabled: false,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/notifications/preferences.test.ts
```

- [ ] **Step 3: Schema**

Append to `lib/services/notifications/schemas.ts`:

```ts
export const upsertPreferenceInputSchema = z.object({
  target: z.enum(["user", "org"]).optional(),
  eventType: z.string().min(1).max(100),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
});
export type UpsertPreferenceInput = z.infer<typeof upsertPreferenceInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/notifications/index.ts`:

```ts
import { upsertPreferenceInputSchema, type UpsertPreferenceInput } from "./schemas";

export async function upsertPreference(
  db: AnyDb,
  ctx: OrgContext,
  input: UpsertPreferenceInput,
): Promise<Result<true>> {
  const parsed = upsertPreferenceInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const target = parsed.data.target ?? "user";
  if (target === "org" && ctx.actor.role !== "admin") {
    return err("unauthorized", "Only admins can set the org default");
  }

  const userId = target === "org" ? null : ctx.actor.userId;

  // Find existing row matching (userId, orgId, eventType).
  const existingConds = [
    eq(schema.notificationPreferences.orgId, ctx.orgId),
    eq(schema.notificationPreferences.eventType, parsed.data.eventType),
    userId === null
      ? isNull(schema.notificationPreferences.userId)
      : eq(schema.notificationPreferences.userId, userId),
  ];

  const [existing] = await db
    .select({ id: schema.notificationPreferences.id })
    .from(schema.notificationPreferences)
    .where(and(...existingConds))
    .limit(1);

  if (existing) {
    await db
      .update(schema.notificationPreferences)
      .set({
        inAppEnabled: parsed.data.inAppEnabled,
        emailEnabled: parsed.data.emailEnabled,
      })
      .where(eq(schema.notificationPreferences.id, existing.id));
  } else {
    await db.insert(schema.notificationPreferences).values({
      orgId: ctx.orgId,
      userId,
      eventType: parsed.data.eventType,
      inAppEnabled: parsed.data.inAppEnabled,
      emailEnabled: parsed.data.emailEnabled,
    });
  }

  return ok(true);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/notifications/preferences.test.ts
pnpm test
git add lib/services/notifications tests/unit/services/notifications/preferences.test.ts
git commit -m "feat(services): notifications.upsertPreference (user override + admin org default)"
```

---

### Task 9: users.inviteUser (admin invites customer or staff)

**Files:**
- Create: `lib/services/users/index.ts`
- Create: `lib/services/users/internal.ts`
- Create: `lib/services/users/schemas.ts`
- Create: `tests/unit/services/users/invite.test.ts`

Admin can invite a `customer` (orgId required, becomes a member on accept) or a staff user (`employee` or `admin`, no membership). Inserts a row in `invitations` with a generated token + 7-day expiry. The link is logged to stdout (Plan 4 wires Resend).

- [ ] **Step 1: Failing test**

Create `tests/unit/services/users/invite.test.ts`:

```ts
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
        // orgId missing
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
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/users/invite.test.ts
```

- [ ] **Step 3: Schemas**

Create `lib/services/users/schemas.ts`:

```ts
import { z } from "zod";
import { idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const systemRoleEnum = z.enum(["customer", "employee", "admin"]);

export const inviteUserInputSchema = z
  .object({
    email: z.string().email(),
    name: z.string().max(200).optional(),
    systemRole: systemRoleEnum,
    orgId: idSchema.optional(),
  })
  .refine(
    (v) => (v.systemRole === "customer" ? !!v.orgId : !v.orgId),
    {
      message:
        "Customer invitations require orgId; staff invitations must omit it",
      path: ["orgId"],
    },
  );
export type InviteUserInput = z.infer<typeof inviteUserInputSchema>;

export const acceptInvitationInputSchema = z.object({
  token: nonEmptyStringSchema.max(256),
  password: z.string().min(12).max(256),
  name: nonEmptyStringSchema.max(200),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>;
```

- [ ] **Step 4: Internal helpers**

Create `lib/services/users/internal.ts`:

```ts
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";

/**
 * Generate a URL-safe random token for an invitation. 32 bytes of entropy →
 * 43 base64url chars. Sufficiently unguessable for a 7-day signup link.
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Wrap Better Auth's `hashPassword`. Re-exported here so service code does
 * not import directly from `better-auth/crypto` (keeps a single seam if we
 * ever swap the auth library).
 */
export async function hashUserPassword(password: string): Promise<string> {
  return hashPassword(password);
}
```

- [ ] **Step 5: Public API**

Create `lib/services/users/index.ts`:

```ts
import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireRole } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { inviteUserInputSchema, type InviteUserInput } from "./schemas";
import { generateInvitationToken } from "./internal";

type AnyDb = PgDatabase<any, typeof schema>;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export type InviteUserResult = {
  id: string;
  token: string;
  acceptUrl: string;
};

export async function inviteUser(
  db: AnyDb,
  ctx: OrgContext,
  input: InviteUserInput,
): Promise<Result<InviteUserResult>> {
  const parsed = inviteUserInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  // If customer invite, project ownership: orgId already validated to be present.
  // Verify the org exists.
  if (parsed.data.orgId) {
    const [orgRow] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, parsed.data.orgId))
      .limit(1);
    if (!orgRow) return err("not_found", "Organization not found");
  }

  // Reject if a pending invitation already exists for this email.
  const [existing] = await db
    .select({ id: schema.invitations.id })
    .from(schema.invitations)
    .where(
      and(
        eq(schema.invitations.email, parsed.data.email),
        eq(schema.invitations.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) {
    return err("conflict", "An active invitation for this email already exists");
  }

  const token = generateInvitationToken();
  const id = `inv_${token.slice(0, 24)}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(schema.invitations).values({
    id,
    email: parsed.data.email,
    organizationId: parsed.data.orgId ?? null,
    inviterId: ctx.actor.userId,
    role: parsed.data.systemRole === "customer" ? "member" : null,
    systemRole: parsed.data.systemRole,
    status: "pending",
    expiresAt,
  });

  const acceptUrl = `${env.APP_URL}/signup?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`;
  // Phase 1: log to stdout (Plan 4 wires Resend).
  log.info({ email: parsed.data.email, acceptUrl }, "User invitation created");

  return ok({ id, token, acceptUrl });
}
```

- [ ] **Step 6: GREEN + commit**

```bash
pnpm test tests/unit/services/users/invite.test.ts
pnpm test
git add lib/services/users tests/unit/services/users/invite.test.ts
git commit -m "feat(services): users.inviteUser (admin invites customer/staff with token + log)"
```

---

### Task 10: users.acceptInvitation (consume token, create user + member)

**Files:**
- Modify: `lib/services/users/index.ts`
- Create: `tests/unit/services/users/accept.test.ts`

Public flow (no `OrgContext` — the invitee may not be authenticated yet). Validates the invitation row exists, is `pending`, hasn't expired, and creates a `users` row, an `accounts` row with hashed password, and a `members` row (only for customer invitations). Marks the invitation `accepted`.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/users/accept.test.ts`:

```ts
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

      // Invitation flipped to accepted.
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
      // Hashed password should not equal the plaintext.
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
      // Force-expire it.
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
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/users/accept.test.ts
```

- [ ] **Step 3: Implement**

Append to `lib/services/users/index.ts`:

```ts
import { acceptInvitationInputSchema, type AcceptInvitationInput } from "./schemas";
import { hashUserPassword } from "./internal";

type User = typeof schema.users.$inferSelect;

export async function acceptInvitation(
  db: AnyDb,
  input: AcceptInvitationInput,
): Promise<Result<User>> {
  const parsed = acceptInvitationInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  // The invitation `id` matches the URL param the client received — it's
  // derivable from the token (see inviteUser). We look it up by id+token to
  // avoid scanning all invitation rows.
  const expectedId = `inv_${parsed.data.token.slice(0, 24)}`;

  const [invitation] = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.id, expectedId))
    .limit(1);
  if (!invitation) return err("not_found", "Invitation not found");

  if (invitation.status !== "pending") {
    return err("conflict", `Invitation has status '${invitation.status}'`);
  }
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
    return err("conflict", "Invitation has expired");
  }
  if (!invitation.systemRole) {
    return err("server", "Invitation row missing systemRole — cannot accept");
  }

  const passwordHash = await hashUserPassword(parsed.data.password);

  const userIdPrefix =
    invitation.systemRole === "customer"
      ? "usr_cust"
      : invitation.systemRole === "admin"
        ? "usr_admin"
        : "usr_emp";
  const userId = `${userIdPrefix}_${parsed.data.token.slice(0, 16)}`;

  // Insert user.
  const [user] = await db
    .insert(schema.users)
    .values({
      id: userId,
      email: invitation.email,
      name: parsed.data.name,
      emailVerified: true, // accepting via emailed link is itself verification
      systemRole: invitation.systemRole,
    })
    .returning();

  // Insert credential account.
  await db.insert(schema.accounts).values({
    id: `acc_${userId}`,
    userId,
    accountId: invitation.email,
    providerId: "credential",
    password: passwordHash,
  });

  // Insert membership for customers.
  if (invitation.systemRole === "customer" && invitation.organizationId) {
    await db.insert(schema.members).values({
      id: `mbr_${userId}`,
      userId,
      organizationId: invitation.organizationId,
      role: invitation.role ?? "member",
    });
  }

  // Mark invitation accepted.
  await db
    .update(schema.invitations)
    .set({ status: "accepted" })
    .where(eq(schema.invitations.id, invitation.id));

  return ok(user!);
}
```

- [ ] **Step 4: GREEN + commit**

```bash
pnpm test tests/unit/services/users/accept.test.ts
pnpm test
git add lib/services/users tests/unit/services/users/accept.test.ts
git commit -m "feat(services): users.acceptInvitation (creates user + account + member)"
```

---

### Task 11: users.listOrgMembers (admin)

**Files:**
- Modify: `lib/services/users/index.ts`
- Modify: `lib/services/users/schemas.ts`
- Create: `tests/unit/services/users/list-org-members.test.ts`

Returns customer users that are members of a given org. Admin only. Used by the admin "manage org users" view.

- [ ] **Step 1: Failing test**

Create `tests/unit/services/users/list-org-members.test.ts`:

```ts
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
```

- [ ] **Step 2: RED**

```bash
pnpm test tests/unit/services/users/list-org-members.test.ts
```

- [ ] **Step 3: Schema**

Append to `lib/services/users/schemas.ts`:

```ts
export const listOrgMembersInputSchema = z.object({
  orgId: idSchema,
});
export type ListOrgMembersInput = z.infer<typeof listOrgMembersInputSchema>;
```

- [ ] **Step 4: Implement**

Append to `lib/services/users/index.ts`:

```ts
import { asc } from "drizzle-orm";
import { listOrgMembersInputSchema, type ListOrgMembersInput } from "./schemas";

export async function listOrgMembers(
  db: AnyDb,
  ctx: OrgContext,
  input: ListOrgMembersInput,
): Promise<Result<User[]>> {
  const parsed = listOrgMembersInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  // Customer users that are members of the requested org.
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      emailVerified: schema.users.emailVerified,
      image: schema.users.image,
      systemRole: schema.users.systemRole,
      defaultHourlyRateCents: schema.users.defaultHourlyRateCents,
      timezone: schema.users.timezone,
      notificationPreferencesSet: schema.users.notificationPreferencesSet,
      createdAt: schema.users.createdAt,
      updatedAt: schema.users.updatedAt,
    })
    .from(schema.users)
    .innerJoin(schema.members, eq(schema.members.userId, schema.users.id))
    .where(eq(schema.members.organizationId, parsed.data.orgId))
    .orderBy(asc(schema.users.email));
  return ok(rows);
}
```

- [ ] **Step 5: GREEN + commit**

```bash
pnpm test tests/unit/services/users/list-org-members.test.ts
pnpm test
git add lib/services/users tests/unit/services/users/list-org-members.test.ts
git commit -m "feat(services): users.listOrgMembers (admin-only, sorted by email)"
```

---

### Task 12: Final verification + branch wrap

- [ ] **Step 1: Full sweep**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
All clean. Test count target: ~205+.

- [ ] **Step 2: Working tree clean**

```bash
git status
```
Expected: working tree clean (apart from the user-controlled `.vscode/settings.json` if still present).

- [ ] **Step 3: Confirm exports**

```bash
node --env-file=.env -e "import('./lib/services/attachments/index.ts').then(m => console.log(Object.keys(m).sort()))"
node --env-file=.env -e "import('./lib/services/notifications/index.ts').then(m => console.log(Object.keys(m).sort()))"
node --env-file=.env -e "import('./lib/services/users/index.ts').then(m => console.log(Object.keys(m).sort()))"
```

Expected exports:
- attachments: `confirm`, `gcPending`, `getUploadUrl`, `listForParent`
- notifications: `emit`, `listForUser`, `markRead`, `upsertPreference`
- users: `acceptInvitation`, `inviteUser`, `listOrgMembers`

- [ ] **Step 4: Hand off**

Branch `feat/phase-1-services-cross-cutting` ready for merge into `main`. Plan 3 (UI / customer + employee dashboards) follows.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-05-08-marketing-crm-phase-1-design.md`):

- §6 attachments table — exercised in Tasks 1-5 ✓
- §6 notifications + notification_preferences + notification_deliveries — emit pipeline (Plan 2a Task 3) + read API (Tasks 6-8) ✓
- §6 invitations table — Tasks 9-10 ✓
- §6 users.system_role + memberships — Task 10 (acceptInvitation), Task 11 (listOrgMembers) ✓
- §8.11 file upload flow (presign → upload → confirm + GC) — Tasks 2-4 ✓
- §9.2 preferences resolution (user override → org default → fallback) — Task 8 sets the rows; resolution already implemented in Plan 2a Task 3 ✓
- §10 R2 file storage — Task 1 buildR2Key + Tasks 2-4 ✓
- §15 CRON_SECRET cron auth — already in Plan 1 Task 27; Task 4 here implements the actual GC logic the cron route will call

**Out of scope (deliberately):**
- Email delivery (still Plan 4)
- Magic-link/Google OAuth invitation paths (Plan 4 if needed; Phase 1 admin invites cover the use case)
- Server Actions / UI — Plan 3+

**Placeholder scan:** None. Each step has full code.

**Type consistency:**
- `AnyDb`, `OrgContext`, `Result<T, AppError>` consistent across all services.
- `attachmentParentTypeEnum` used the same way in `attachments/schemas.ts` and the auth helpers.
- `systemRoleEnum` matches the schema enum + `users.systemRole` column.
- `inviteUser` returns `{ id, token, acceptUrl }`; `acceptInvitation` derives `id` deterministically from `token` (`inv_${token.slice(0, 24)}`) — same scheme on both sides.

**Architectural decisions baked in (matching Plans 2a/2b):**
- Attachments R2 calls go through `lib/storage/r2-client.ts`; tests mock that module via `vi.mock`.
- Invitation tokens are 32 bytes → base64url; `id` is the first 24 token chars prefixed with `inv_` so we can look up by id without searching by token.
- Better Auth's `hashPassword` is the only password-hashing path (matches Plan 1 Task 28's E2E seed approach).
- `acceptInvitation` is the only public service function in this plan that does NOT take an `OrgContext` — the invitee may not be authenticated yet.
- `notifications.markRead` is bulk-by-design (the read API will be called from a "mark all" UI button alongside per-row marking).
- `notifications.upsertPreference` allows admins to set the org default in addition to user overrides — matches §9.2 design.
- `users.listOrgMembers` returns only customer users (those with a `members` row). Staff listing is deferred until Plan 4 (admin user management UI).
