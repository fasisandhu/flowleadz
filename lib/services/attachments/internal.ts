import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireTaskWrite } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import type { AttachmentParentType } from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export async function authorizeAttachmentParentWrite(
  db: AnyDb,
  ctx: OrgContext,
  parentType: AttachmentParentType,
  parentId: string,
): Promise<Result<true>> {
  if (parentType === "user_avatar") {
    if (parentId !== ctx.actor.userId) {
      return err("unauthorized", "Cannot manage another user's avatar");
    }
    return ok(true);
  }
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
          userId: schema.comments.userId,
          deletedAt: schema.comments.deletedAt,
        })
        .from(schema.comments)
        .where(eq(schema.comments.id, parentId))
        .limit(1);
      if (!row) return err("not_found", "Parent not found");
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

export async function authorizeAttachmentParentRead(
  db: AnyDb,
  ctx: OrgContext,
  parentType: AttachmentParentType,
  parentId: string,
): Promise<Result<true>> {
  if (parentType === "user_avatar") {
    if (parentId !== ctx.actor.userId) {
      return err("unauthorized", "Cannot manage another user's avatar");
    }
    return ok(true);
  }
  const { requireDailyUpdateRead, requireTaskRead, requireOrgAccess } = await import(
    "@/lib/services/_auth/predicates"
  );
  switch (parentType) {
    case "daily_update":
      return requireDailyUpdateRead(db, ctx, parentId);
    case "task":
      return requireTaskRead(db, ctx, parentId);
    case "comment": {
      const [row] = await db
        .select({
          id: schema.comments.id,
          parentType: schema.comments.parentType,
          parentId: schema.comments.parentId,
        })
        .from(schema.comments)
        .where(eq(schema.comments.id, parentId))
        .limit(1);
      if (!row) return err("not_found", "Parent not found");
      if (row.parentType === "daily_update") {
        return requireDailyUpdateRead(db, ctx, row.parentId);
      }
      return requireTaskRead(db, ctx, row.parentId);
    }
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
      if (ctx.actor.role === "customer" && row.submittedBy !== ctx.actor.userId) {
        return err("unauthorized", "Customers can only see their own requests");
      }
      return requireOrgAccess(db, ctx);
    }
  }
}

export function buildR2Key(
  orgId: string,
  parentType: AttachmentParentType,
  attachmentId: string,
  filename: string,
): string {
  return `${orgId}/${parentType}/${attachmentId}/${filename}`;
}
