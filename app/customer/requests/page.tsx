import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { format } from "date-fns";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/app/page-header";
import { listWorkRequestsAction } from "@/lib/server-actions/work-requests";
import { EmptyState } from "@/components/app/empty-state";
import { EmptyRequestsIllustration } from "@/components/app/illustrations/empty-requests";

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

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export default async function CustomerRequestsPage() {
  const r = await listWorkRequestsAction({});
  const requests = r.ok ? r.data : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work requests"
        subtitle={`${requests.length} total`}
        action={
          <Link
            href="/customer/requests/new"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <Plus className="mr-1 h-4 w-4" />
            New request
          </Link>
        }
      />

      {requests.length === 0 ? (
        <EmptyState
          illustration={EmptyRequestsIllustration}
          title="No work requests yet"
          description="Click 'New work request' to submit your first one."
          action={
            <Link
              href="/customer/requests/new"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              New work request
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          {requests.map((req) => (
            <div
              key={req.id}
              className="group relative flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3 transition last:border-b-0 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/40"
            >
              <Link
                href={`/customer/requests/${req.id}`}
                aria-label={`Open ${req.title}`}
                className="absolute inset-0"
              />
              <span
                className={`relative z-10 h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[req.status] ?? "bg-slate-400"}`}
                aria-hidden="true"
              />
              <div className="relative z-10 min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-slate-900 group-hover:text-indigo-600 dark:text-slate-50 dark:group-hover:text-indigo-400">
                    {req.title}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
                    {STATUS_LABELS[req.status] ?? req.status}
                  </span>
                </div>
                {req.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                    {req.description}
                  </p>
                )}
              </div>
              <span className="hidden text-xs text-slate-500 dark:text-slate-400 sm:inline">
                {PRIORITY_LABELS[req.priorityHint] ?? req.priorityHint}
              </span>
              <span className="hidden text-xs tabular-nums text-slate-400 dark:text-slate-500 md:inline">
                {format(new Date(req.createdAt), "MMM d, yyyy")}
              </span>
              {req.status === "accepted" && req.resolvedTaskId && (
                <Link
                  href={`/customer/tasks/${req.resolvedTaskId}`}
                  className="relative z-10 hidden rounded-md border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/40 sm:inline-flex"
                >
                  View task
                </Link>
              )}
              <ArrowRight className="relative z-10 h-3.5 w-3.5 flex-shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
