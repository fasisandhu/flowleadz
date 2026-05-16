import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { TaskStatusPill } from "@/components/ui/status-pill";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { AttachmentList } from "@/components/app/attachment-list";
import { TaskActionBar } from "@/components/app/task-action-bar";
import { TaskAssigneeManager } from "@/components/app/task-assignee-manager";
import {
  adminGetTaskAction,
  adminGetTaskActivityAction,
  adminGetTaskAssigneesAction,
} from "@/lib/server-actions/admin/tasks";
import { adminGetProjectAction } from "@/lib/server-actions/admin/projects";
import { adminListStaffUsersAction } from "@/lib/server-actions/admin/users";
import type { TaskStatus } from "@/lib/constants/status";

export default async function AdminTaskDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; taskId: string }>;
}) {
  const { orgId, taskId } = await params;

  const [taskR, activityR, assigneesR, staffR] = await Promise.all([
    adminGetTaskAction(orgId, taskId),
    adminGetTaskActivityAction(orgId, taskId),
    adminGetTaskAssigneesAction(orgId, taskId),
    adminListStaffUsersAction(orgId),
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
  const staffOptions = staffR.ok
    ? staffR.data.map((u) => ({ id: u.id, name: u.name ?? u.email }))
    : [];

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
        {task.sourceRequester && (
          <span>
            Requested by{" "}
            <span className="text-slate-700 dark:text-slate-200">
              {task.sourceRequester.name ?? task.sourceRequester.email}
            </span>
          </span>
        )}
        {task.dueDate && (
          <span>Due {format(new Date(task.dueDate), "MMM d, yyyy")}</span>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Assignees
        </h2>
        <TaskAssigneeManager
          orgId={orgId}
          taskId={taskId}
          initialAssignees={assignees}
          staffOptions={staffOptions}
        />
      </div>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Activity</h2>
        <ActivityFeed events={activity} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Attachments</h2>
        <AttachmentList parentType="task" parentId={taskId} orgId={orgId} />
      </section>

      {task.projectId && (
        <TaskActionBar
          taskId={taskId}
          projectId={task.projectId}
          currentStatus={task.status as TaskStatus}
          orgId={orgId}
          canPostUpdate={true}
          canLogTime={true}
          canChangeStatus={true}
          canAttach={true}
          canComment={true}
        />
      )}
    </div>
  );
}
