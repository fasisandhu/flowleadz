import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { adminGetProjectAction } from "@/lib/server-actions/admin/projects";
import { adminListProjectAssignmentsAction } from "@/lib/server-actions/admin/projects";
import { adminListOrgMembersAction } from "@/lib/server-actions/admin/users";
import { adminListTasksAction } from "@/lib/server-actions/admin/tasks";
import { ProjectTeamManager } from "@/components/app/project-team-manager";

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const TASK_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  todo: "outline",
  in_progress: "default",
  blocked: "destructive",
  done: "secondary",
  cancelled: "secondary",
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
    return <p className="text-sm text-red-600">{projectR.error.message}</p>;
  }
  const project = projectR.data;

  const [tasksR, membersR, assignmentsR] = await Promise.all([
    adminListTasksAction(orgId, { projectId }),
    adminListOrgMembersAction(orgId),
    adminListProjectAssignmentsAction(orgId, projectId),
  ]);
  const tasks = tasksR.ok ? tasksR.data : [];
  const assignments = assignmentsR.ok ? assignmentsR.data : [];

  // Staff candidate list: org members with systemRole employee or admin.
  const members = membersR.ok ? membersR.data : [];
  const staffOptions = members
    .filter((m) => m.systemRole === "employee" || m.systemRole === "admin")
    .map((m) => ({ id: m.id, name: m.name ?? m.email }));

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-slate-600 capitalize">
            {project.serviceType.replace(/_/g, " ")}
          </p>
          {project.description && (
            <p className="mt-3 max-w-prose whitespace-pre-wrap text-sm text-slate-700">
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

      <section>
        <h2 className="mb-3 text-lg font-medium">Tasks</h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">No tasks yet.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <Card key={t.id}>
                <CardContent className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      <Badge
                        variant={TASK_STATUS_VARIANT[t.status] ?? "outline"}
                        className="text-xs"
                      >
                        {TASK_STATUS_LABELS[t.status] ?? t.status}
                      </Badge>
                      {t.dueDate && (
                        <span>Due {format(new Date(t.dueDate), "MMM d")}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
