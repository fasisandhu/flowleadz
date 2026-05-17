import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { getWorkRequestAction } from "@/lib/server-actions/work-requests";
import { AttachmentList } from "@/components/app/attachment-list";
import { AttachmentUpload } from "@/components/app/attachment-upload";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted — awaiting review",
  accepted: "Accepted",
  rejected: "Rejected",
  duplicate: "Marked as duplicate",
};

const STATUS_DOT: Record<string, string> = {
  submitted: "bg-amber-500",
  accepted: "bg-emerald-500",
  rejected: "bg-rose-500",
  duplicate: "bg-slate-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export default async function CustomerRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const r = await getWorkRequestAction(requestId);
  if (!r.ok) {
    if (r.error.code === "not_found" || r.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600 dark:text-red-400">{r.error.message}</p>;
  }
  const req = r.data;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[req.status] ?? "bg-slate-400"}`}
            aria-hidden="true"
          />
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {STATUS_LABELS[req.status] ?? req.status}
          </span>
          <span className="text-slate-400 dark:text-slate-500">·</span>
          <span className="text-slate-500 dark:text-slate-400">
            {PRIORITY_LABELS[req.priorityHint] ?? req.priorityHint} priority
          </span>
          <span className="text-slate-400 dark:text-slate-500">·</span>
          <span className="text-slate-500 dark:text-slate-400">
            {format(new Date(req.createdAt), "MMM d, yyyy h:mm a")}
          </span>
        </div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
          {req.title}
        </h1>
      </header>

      {req.status === "accepted" && req.resolvedTaskId && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            Tracked as
          </h2>
          <Link
            href={`/customer/tasks/${req.resolvedTaskId}`}
            className="group flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/50"
          >
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                View the task we created
              </div>
              <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                Track progress, see updates, and comment as the work happens.
              </div>
            </div>
            <ArrowRight className="h-4 w-4 flex-shrink-0 text-emerald-500 transition group-hover:translate-x-0.5" />
          </Link>
        </section>
      )}

      {req.description && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            Description
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            {req.description}
          </p>
        </section>
      )}

      {req.rejectionReason && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            {req.status === "duplicate" ? "Note from admin" : "Reason for rejection"}
          </h2>
          <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
            {req.rejectionReason}
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
          Attachments
        </h2>
        <AttachmentList parentType="work_request" parentId={requestId} />
        <AttachmentUpload parentType="work_request" parentId={requestId} />
      </section>
    </div>
  );
}
