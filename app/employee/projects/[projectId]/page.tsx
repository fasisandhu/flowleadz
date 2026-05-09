import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getProjectAction } from "@/lib/server-actions/projects";
import { listDailyUpdatesAction } from "@/lib/server-actions/daily-updates";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { DailyUpdateCard } from "@/components/app/daily-update-card";
import { TaskStatusChanger } from "@/components/app/task-status-changer";

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  todo: "outline",
  in_progress: "default",
  blocked: "destructive",
  done: "secondary",
  cancelled: "secondary",
};

export default async function EmployeeProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const projectR = await getProjectAction(projectId);
  if (!projectR.ok) {
    if (projectR.error.code === "not_found" || projectR.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{projectR.error.message}</p>;
  }
  const project = projectR.data;

  const [updatesR, tasksR] = await Promise.all([
    listDailyUpdatesAction({ projectId }),
    listTasksAction({ projectId }),
  ]);
  const updates = updatesR.ok ? updatesR.data : [];
  const tasks = tasksR.ok ? tasksR.data : [];

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
                      <Badge variant={STATUS_VARIANT[t.status] ?? "outline"} className="text-xs">
                        {STATUS_LABELS[t.status] ?? t.status}
                      </Badge>
                      {t.dueDate && <span>Due {format(new Date(t.dueDate), "MMM d")}</span>}
                    </div>
                  </div>
                  <TaskStatusChanger
                    taskId={t.id}
                    currentStatus={t.status as "todo" | "in_progress" | "blocked" | "done" | "cancelled"}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Updates</h2>
        {updates.length === 0 ? (
          <p className="text-sm text-slate-500">No updates yet.</p>
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
