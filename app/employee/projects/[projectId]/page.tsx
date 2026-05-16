import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getProjectAction } from "@/lib/server-actions/projects";
import { listDailyUpdatesAction } from "@/lib/server-actions/daily-updates";
import { listTasksWithCardDataAction } from "@/lib/server-actions/tasks";
import { DailyUpdateCard } from "@/components/app/daily-update-card";
import { TaskCard } from "@/components/app/task-card";

export default async function EmployeeProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const projectR = await getProjectAction(projectId);
  if (!projectR.ok) {
    if (projectR.error.code === "not_found" || projectR.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600 dark:text-red-400">{projectR.error.message}</p>;
  }
  const project = projectR.data;

  const [updatesR, tasksR] = await Promise.all([
    listDailyUpdatesAction({ projectId }),
    listTasksWithCardDataAction({ projectId }),
  ]);
  const updates = updatesR.ok ? updatesR.data : [];
  const tasks = tasksR.ok ? tasksR.data : [];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-slate-600 capitalize dark:text-slate-300">
            {project.serviceType.replace("_", " ")}
          </p>
          {project.description && (
            <p className="mt-3 max-w-prose whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
              {project.description}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant="secondary" className="capitalize">
            {project.status}
          </Badge>
          <div className="flex gap-2">
            <Link
              href={`/employee/projects/${projectId}/updates/new`}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              <Plus className="mr-1 h-3 w-3" />
              Post update
            </Link>
            <Link
              href={`/employee/projects/${projectId}/time/new`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              <Clock className="mr-1 h-3 w-3" />
              Log time
            </Link>
          </div>
        </div>
      </header>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Tasks</h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No tasks yet.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <TaskCard key={t.id} task={t} href={`/employee/tasks/${t.id}`} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Daily updates</h2>
        {updates.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No updates yet.</p>
        ) : (
          <div className="space-y-3">
            {updates.map((u) => (
              <DailyUpdateCard key={u.id} update={u} hrefBase="/employee/projects" />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
