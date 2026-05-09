import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getProjectAction } from "@/lib/server-actions/projects";
import { listDailyUpdatesAction } from "@/lib/server-actions/daily-updates";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { DailyUpdateCard } from "@/components/app/daily-update-card";
import { TaskListItem } from "@/components/app/task-list-item";

export default async function CustomerProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const projectR = await getProjectAction(projectId);
  if (!projectR.ok) {
    if (projectR.error.code === "not_found") notFound();
    return <p className="text-sm text-red-600">{projectR.error.message}</p>;
  }
  const project = projectR.data;

  const [updatesR, tasksR] = await Promise.all([
    listDailyUpdatesAction({ projectId }),
    listTasksAction({ projectId }),
  ]);

  const updates = updatesR.ok ? updatesR.data : [];
  const upcomingTasks = tasksR.ok
    ? tasksR.data.filter((t) => ["todo", "in_progress", "blocked"].includes(t.status))
    : [];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-slate-600 capitalize">
            {project.serviceType.replace("_", " ")}
          </p>
          {project.description && (
            <p className="mt-3 max-w-prose whitespace-pre-wrap text-sm text-slate-700">
              {project.description}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <Badge variant="secondary" className="capitalize">
            {project.status}
          </Badge>
          {project.startDate && (
            <span className="text-xs text-slate-500">
              Started {format(new Date(project.startDate), "MMM d, yyyy")}
            </span>
          )}
        </div>
      </header>

      <Separator />

      <section>
        <h2 className="mb-3 text-lg font-medium">Updates</h2>
        {updates.length === 0 ? (
          <p className="text-sm text-slate-500">No updates yet.</p>
        ) : (
          <div className="space-y-3">
            {updates.map((u) => (
              <DailyUpdateCard key={u.id} update={u} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Upcoming tasks</h2>
        {upcomingTasks.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing on deck.</p>
        ) : (
          <Card>
            <CardContent className="space-y-2 p-4">
              {upcomingTasks.map((t) => (
                <TaskListItem key={t.id} task={t} />
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
