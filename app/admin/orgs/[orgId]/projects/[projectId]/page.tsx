import { notFound } from "next/navigation";
import { adminGetProjectAction } from "@/lib/server-actions/admin/projects";
import { adminListProjectAssignmentsAction } from "@/lib/server-actions/admin/projects";
import { adminListStaffUsersAction } from "@/lib/server-actions/admin/users";
import { adminListTasksWithCardDataAction } from "@/lib/server-actions/admin/tasks";
import { ProjectTeamManager } from "@/components/app/project-team-manager";
import { TaskCard } from "@/components/app/task-card";
import { TaskCreateForm } from "@/components/app/task-create-form";
import { ProjectEditForm } from "@/components/app/project-edit-form";

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  completed: "bg-slate-400",
  archived: "bg-slate-300 dark:bg-slate-600",
  draft: "bg-slate-300 dark:bg-slate-600",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
  draft: "Draft",
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  seo: "SEO",
  paid_ads: "Paid Ads",
  social: "Social",
  content: "Content",
  web: "Web",
  other: "Other",
};

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
    <div className="space-y-8">
      <header className="space-y-3 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[project.status] ?? "bg-slate-400"}`}
            aria-hidden="true"
          />
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {STATUS_LABELS[project.status] ?? project.status}
          </span>
          <span className="text-slate-400 dark:text-slate-500">·</span>
          <span className="text-slate-500 dark:text-slate-400">
            {SERVICE_TYPE_LABELS[project.serviceType] ?? project.serviceType}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
              {project.name}
            </h1>
            {project.description && (
              <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
                {project.description}
              </p>
            )}
          </div>
          <ProjectEditForm
            orgId={orgId}
            project={{
              id: project.id,
              name: project.name,
              description: project.description,
              serviceType: project.serviceType,
              status: project.status,
              startDate: project.startDate,
              endDate: project.endDate,
              hourlyRateCents: project.hourlyRateCents,
            }}
          />
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
          Team
        </h2>
        <ProjectTeamManager
          orgId={orgId}
          projectId={projectId}
          initialAssignments={assignments}
          staffOptions={staffOptions}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            Tasks
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
            {tasks.length}
          </span>
        </div>
        <TaskCreateForm orgId={orgId} projectId={projectId} />
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            No tasks yet.
          </p>
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
