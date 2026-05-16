import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  submitted: "default",
  accepted: "secondary",
  rejected: "destructive",
  duplicate: "outline",
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
    <article className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-xs">
          <Badge variant={STATUS_VARIANT[req.status] ?? "outline"}>
            {STATUS_LABELS[req.status] ?? req.status}
          </Badge>
          {req.priorityHint && (
            <Badge variant="outline">
              Priority: {PRIORITY_LABELS[req.priorityHint] ?? req.priorityHint}
            </Badge>
          )}
          <span className="text-slate-500 dark:text-slate-400">
            Submitted by {req.submitter.name ?? req.submitter.email}
            {" · "}
            {format(new Date(req.createdAt), "MMM d, yyyy h:mm a")}
          </span>
        </div>
        <h1 className="text-xl font-semibold">{req.title}</h1>
      </header>

      {req.description && (
        <div className="rounded-md border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{req.description}</p>
        </div>
      )}

      <Separator />

      <section>
        <h2 className="mb-3 text-lg font-medium">Review</h2>
        <WorkRequestReviewBar
          orgId={orgId}
          requestId={requestId}
          initialStatus={req.status}
          projects={projects}
          tasks={tasks}
          staff={staff}
        />
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Attachments</h2>
        <AttachmentList parentType="work_request" parentId={requestId} orgId={orgId} />
      </section>
    </article>
  );
}
