import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { TaskStatusPill } from "@/components/ui/status-pill";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { AttachmentList } from "@/components/app/attachment-list";
import { TaskActionBar } from "@/components/app/task-action-bar";
import {
  adminGetTaskAction,
  adminGetTaskActivityAction,
  adminGetTaskAssigneesAction,
} from "@/lib/server-actions/admin/tasks";
import { adminGetProjectAction } from "@/lib/server-actions/admin/projects";
import type { TaskStatus } from "@/lib/constants/status";

export default async function AdminTaskDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; taskId: string }>;
}) {
  const { orgId, taskId } = await params;

  const [taskR, activityR, assigneesR] = await Promise.all([
    adminGetTaskAction(orgId, taskId),
    adminGetTaskActivityAction(orgId, taskId),
    adminGetTaskAssigneesAction(orgId, taskId),
  ]);

  if (!taskR.ok) {
    if (taskR.error.code === "not_found" || taskR.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600 dark:text-red-400">{taskR.error.message}</p>;
  }
  const task = taskR.data;

  const projectR = task.projectId ? await adminGetProjectAction(orgId, task.projectId) : null;
  const project = projectR?.ok ? projectR.data : null;

  const assignees = assigneesR.ok ? assigneesR.data : [];
  const activity = activityR.ok ? activityR.data : [];

  return (
    <div className="space-y-6">
      {project && (
        <Link
          href={`/admin/orgs/${orgId}/projects/${project.id}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-3 w-3" /> Back to {project.name}
        </Link>
      )}

      <PageHeader
        title={task.title}
        subtitle={task.description ?? undefined}
        action={<TaskStatusPill status={task.status as TaskStatus} />}
      />

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
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

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Attachments</h2>
        <AttachmentList parentType="task" parentId={taskId} />
      </section>

      {task.projectId && (
        <TaskActionBar
          taskId={taskId}
          projectId={task.projectId}
          currentStatus={task.status as TaskStatus}
          canPostUpdate={true}
          canLogTime={true}
          canChangeStatus={true}
          canAttach={true}
        />
      )}
    </div>
  );
}
