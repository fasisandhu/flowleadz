import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { adminGetWorkRequestAction } from "@/lib/server-actions/admin/work-requests";
import { adminListProjectsAction } from "@/lib/server-actions/admin/projects";
import { WorkRequestReviewBar } from "@/components/app/work-request-review-bar";

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
    return <p className="text-sm text-red-600">{r.error.message}</p>;
  }
  const req = r.data;

  const projectsR = await adminListProjectsAction(orgId, { status: "active" });
  const projects = projectsR.ok ? projectsR.data.map((p) => ({ id: p.id, name: p.name })) : [];

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
          <span className="text-slate-500">
            Submitted {format(new Date(req.createdAt), "MMM d, yyyy h:mm a")}
          </span>
        </div>
        <h1 className="text-xl font-semibold">{req.title}</h1>
      </header>

      {req.description && (
        <div className="rounded-md border bg-white p-4">
          <p className="whitespace-pre-wrap text-sm text-slate-800">{req.description}</p>
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
        />
      </section>
    </article>
  );
}
