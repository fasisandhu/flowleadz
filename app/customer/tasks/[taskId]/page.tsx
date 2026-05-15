import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { TaskStatusPill } from "@/components/ui/status-pill";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import {
  getTaskAction,
  getTaskActivityAction,
  getTaskAssigneesAction,
} from "@/lib/server-actions/tasks";
import { getProjectAction } from "@/lib/server-actions/projects";
import type { TaskStatus } from "@/lib/constants/status";

export default async function CustomerTaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;

  const [taskR, activityR, assigneesR] = await Promise.all([
    getTaskAction(taskId),
    getTaskActivityAction(taskId),
    getTaskAssigneesAction(taskId),
  ]);

  if (!taskR.ok) {
    if (taskR.error.code === "not_found" || taskR.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{taskR.error.message}</p>;
  }
  const task = taskR.data;

  const projectR = await getProjectAction(task.projectId ?? "");
  const project = projectR.ok ? projectR.data : null;

  const assignees = assigneesR.ok ? assigneesR.data : [];
  const activity = activityR.ok ? activityR.data : [];

  return (
    <div className="space-y-6">
      {project && (
        <Link
          href={`/customer/projects/${project.id}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-3 w-3" /> Back to {project.name}
        </Link>
      )}

      <PageHeader
        title={task.title}
        subtitle={task.description ?? undefined}
        action={<TaskStatusPill status={task.status as TaskStatus} />}
      />

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {task.dueDate && (
          <span>Due {format(new Date(task.dueDate), "MMM d, yyyy")}</span>
        )}
        {assignees.length > 0 && (
          <div className="flex items-center gap-1">
            <span>Assigned:</span>
            {assignees.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1">
                <Avatar userId={a.id} name={a.name} email={a.email} size="xs" />
                <span>{a.name || a.email}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Activity</h2>
        <ActivityFeed events={activity} />
      </section>
    </div>
  );
}
