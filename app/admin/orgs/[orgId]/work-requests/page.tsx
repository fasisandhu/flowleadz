import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { adminListWorkRequestsAction } from "@/lib/server-actions/admin/work-requests";

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

const FILTERS = ["all", "submitted", "accepted", "rejected", "duplicate"] as const;
type FilterValue = (typeof FILTERS)[number];

export default async function AdminWorkRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgId } = await params;
  const { status: statusParam } = await searchParams;
  const filter: FilterValue = (FILTERS as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as FilterValue)
    : "submitted";

  const serviceFilter =
    filter === "all"
      ? {}
      : { status: filter as "submitted" | "accepted" | "rejected" | "duplicate" };
  const r = await adminListWorkRequestsAction(orgId, serviceFilter);
  const requests = r.ok ? r.data : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Work requests" subtitle={`${requests.length} ${filter}`} />

      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/orgs/${orgId}/work-requests?status=${f}`}
            className={
              "relative -mb-px border-b-2 px-3 py-1.5 text-xs font-medium transition " +
              (filter === f
                ? "border-indigo-500 text-slate-900 dark:text-slate-50"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100")
            }
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
          No requests match.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          {requests.map((req) => (
            <Link
              key={req.id}
              href={`/admin/orgs/${orgId}/work-requests/${req.id}`}
              className="group flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3 transition last:border-b-0 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/40"
            >
              <span
                className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[req.status] ?? "bg-slate-400"}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                    {req.title}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
                    {STATUS_LABELS[req.status] ?? req.status}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  by {req.submitter.name ?? req.submitter.email}
                  {req.priorityHint && req.priorityHint !== "normal" && (
                    <>
                      <span className="text-slate-400 dark:text-slate-600"> · </span>
                      <span>{PRIORITY_LABELS[req.priorityHint] ?? req.priorityHint} priority</span>
                    </>
                  )}
                </div>
              </div>
              <span className="hidden text-xs tabular-nums text-slate-400 dark:text-slate-500 md:inline">
                {format(new Date(req.createdAt), "MMM d, yyyy")}
              </span>
              <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
