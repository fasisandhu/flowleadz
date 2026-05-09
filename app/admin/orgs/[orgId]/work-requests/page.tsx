import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminListWorkRequestsAction } from "@/lib/server-actions/admin/work-requests";

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

const FILTERS = ["all", "submitted", "accepted", "rejected", "duplicate"] as const;

type FilterValue = typeof FILTERS[number];

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

  const serviceFilter = filter === "all" ? {} : { status: filter as "submitted" | "accepted" | "rejected" | "duplicate" };
  const r = await adminListWorkRequestsAction(orgId, serviceFilter);
  const requests = r.ok ? r.data : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Work requests</h1>

      <div className="flex flex-wrap gap-1 text-xs">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/orgs/${orgId}/work-requests?status=${f}`}
            className={`rounded-full border px-3 py-1 ${
              filter === f ? "border-blue-500 bg-blue-50 text-blue-700" : "hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-slate-500">No requests match.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/orgs/${orgId}/work-requests/${req.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {req.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {format(new Date(req.createdAt), "MMM d, yyyy h:mm a")}
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[req.status] ?? "outline"} className="text-xs">
                  {STATUS_LABELS[req.status] ?? req.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
