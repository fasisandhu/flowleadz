"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "../_action";
import * as projects from "@/lib/services/projects";

export async function adminListProjectsAction(orgId: string, input: projects.ListProjectsInput = {}) {
  return withSessionContext((db, ctx) => projects.listProjects(db, ctx, input), { staffOrgId: orgId });
}

export async function adminGetProjectAction(orgId: string, projectId: string) {
  return withSessionContext((db, ctx) => projects.getProject(db, ctx, projectId), { staffOrgId: orgId });
}

export async function adminCreateProjectAction(orgId: string, input: projects.CreateProjectInput) {
  const r = await withSessionContext((db, ctx) => projects.createProject(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) revalidatePath(`/admin/orgs/${orgId}/projects`, "layout");
  return r;
}

export async function adminUpdateProjectAction(orgId: string, input: projects.UpdateProjectInput) {
  const r = await withSessionContext((db, ctx) => projects.updateProject(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/projects`, "layout");
    revalidatePath("/employee/projects", "layout");
    revalidatePath("/customer/projects", "layout");
  }
  return r;
}

export async function adminAssignToProjectAction(orgId: string, input: projects.AssignmentInput) {
  const r = await withSessionContext((db, ctx) => projects.assignToProject(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) revalidatePath(`/admin/orgs/${orgId}/projects/${input.projectId}`, "page");
  return r;
}

export async function adminUnassignFromProjectAction(orgId: string, input: projects.AssignmentInput) {
  const r = await withSessionContext((db, ctx) => projects.unassignFromProject(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) revalidatePath(`/admin/orgs/${orgId}/projects/${input.projectId}`, "page");
  return r;
}
