"use server";

import { withSessionContext } from "./_action";
import * as projects from "@/lib/services/projects";

export async function listProjectsAction(input: projects.ListProjectsInput = {}) {
  return withSessionContext((db, ctx) => projects.listProjects(db, ctx, input));
}

export async function getProjectAction(projectId: string) {
  return withSessionContext((db, ctx) => projects.getProject(db, ctx, projectId));
}
