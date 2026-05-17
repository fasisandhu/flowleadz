import { notFound } from "next/navigation";
import { format } from "date-fns";
import { adminGetWorkRequestAction } from "@/lib/server-actions/admin/work-requests";
import { adminListProjectsAction } from "@/lib/server-actions/admin/projects";
import { adminListTasksAction } from "@/lib/server-actions/admin/tasks";
import { adminListStaffUsersAction } from "@/lib/server-actions/admin/users";
import { WorkRequestReviewBar } from "@/components/app/work-request-review-bar";
import { AttachmentList } from "@/components/app/attachment-list";

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  accepted: "Accepted",
  rejected: "Rejected",
  duplicate: "Duplicate",
};

const STATUS_DOT: Record<string, string> = {
  submitted: "bg-amber-500",
  accepted: "bg-emerald-500",
  rejected: "bg-rose-500",
  duplicate: "bg-slate-400",
};

export default async function AdminWorkRequestDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; requestId: string }>;
}) {
  const { orgId, requestId } = await params;
  const r = await adminGetWorkRequestAction(orgId, requestId);
  if (!r.ok) {
    if (r.error.code === "not_found" || r.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600 dark:text-red-400">{r.error.message}</p>;
  }
  const req = r.data;

  const [projectsR, tasksR, staffR] = await Promise.all([
    adminListProjectsAction(orgId, { status: "active" }),
    adminListTasksAction(orgId, {}),
    adminListStaffUsersAction(orgId),
  ]);
  const projects = projectsR.ok ? projectsR.data.map((p) => ({ id: p.id, name: p.name })) : [];
  const tasks = tasksR.ok
    ? tasksR.data
        .filter((t) => t.id !== req.resolvedTaskId)
        .map((t) => ({ id: t.id, title: t.title }))
    : [];
  const staff = staffR.ok
    ? staffR.data.map((u) => ({ id: u.id, name: u.name ?? u.email }))
    : [];

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[req.status] ?? "bg-slate-400"}`}
            aria-hidden="true"
          />
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {STATUS_LABELS[req.status] ?? req.status}
          </span>
          {req.priorityHint && (
            <>
              <span className="text-slate-400 dark:text-slate-500">·</span>
              <span className="text-slate-500 dark:text-slate-400">
                {PRIORITY_LABELS[req.priorityHint] ?? req.priorityHint} priority
              </span>
            </>
          )}
          <span className="text-slate-400 dark:text-slate-500">·</span>
          <span className="text-slate-500 dark:text-slate-400">
            by {req.submitter.name ?? req.submitter.email}
          </span>
          <span className="text-slate-400 dark:text-slate-500">·</span>
          <span className="text-slate-500 dark:text-slate-400">
            {format(new Date(req.createdAt), "MMM d, yyyy h:mm a")}
          </span>
        </div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
          {req.title}
        </h1>
        {req.description && (
          <p className="max-w-prose whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
            {req.description}
          </p>
        )}
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
          Review
        </h2>
        <WorkRequestReviewBar
          orgId={orgId}
          requestId={requestId}
          initialStatus={req.status}
          projects={projects}
          tasks={tasks}
          staff={staff}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
          Attachments
        </h2>
        <AttachmentList parentType="work_request" parentId={requestId} orgId={orgId} />
      </section>
    </article>
  );
}
