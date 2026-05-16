import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { adminGetProjectAction } from "@/lib/server-actions/admin/projects";
import { adminListProjectAssignmentsAction } from "@/lib/server-actions/admin/projects";
import { adminListStaffUsersAction } from "@/lib/server-actions/admin/users";
import { adminListTasksWithCardDataAction } from "@/lib/server-actions/admin/tasks";
import { ProjectTeamManager } from "@/components/app/project-team-manager";
import { TaskCard } from "@/components/app/task-card";
import { TaskCreateForm } from "@/components/app/task-create-form";

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const { orgId, projectId } = await params;
  const projectR = await adminGetProjectAction(orgId, projectId);
  if (!projectR.ok) {
    if (
      projectR.error.code === "not_found" ||
      projectR.error.code === "unauthorized"
    )
      notFound();
    return <p className="text-sm text-red-600 dark:text-red-400">{projectR.error.message}</p>;
  }
  const project = projectR.data;

  const [tasksR, staffR, assignmentsR] = await Promise.all([
    adminListTasksWithCardDataAction(orgId, { projectId }),
    adminListStaffUsersAction(orgId),
    adminListProjectAssignmentsAction(orgId, projectId),
  ]);
  const tasks = tasksR.ok ? tasksR.data : [];
  const assignments = assignmentsR.ok ? assignmentsR.data : [];

  // Staff candidate list: all employees + admins (agency-wide, not org-scoped).
  const staffOptions = staffR.ok
    ? staffR.data.map((u) => ({ id: u.id, name: u.name ?? u.email }))
    : [];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-slate-600 capitalize dark:text-slate-300">
            {project.serviceType.replace(/_/g, " ")}
          </p>
          {project.description && (
            <p className="mt-3 max-w-prose whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
              {project.description}
            </p>
          )}
        </div>
        <Badge variant="secondary" className="capitalize">
          {project.status}
        </Badge>
      </header>

      <Separator />

      <section>
        <h2 className="mb-3 text-lg font-medium">Team</h2>
        <ProjectTeamManager
          orgId={orgId}
          projectId={projectId}
          initialAssignments={assignments}
          staffOptions={staffOptions}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Tasks</h2>
        </div>
        <TaskCreateForm orgId={orgId} projectId={projectId} />
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No tasks yet.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <TaskCard key={t.id} task={t} href={`/admin/orgs/${orgId}/tasks/${t.id}`} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
