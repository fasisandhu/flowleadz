import Link from "next/link";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listWorkRequestsAction } from "@/lib/server-actions/work-requests";

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Work requests</h1>
        <Link href="/customer/requests/new" className={cn(buttonVariants())}>
          <Plus className="mr-2 h-4 w-4" />
          New request
        </Link>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No requests yet.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/customer/requests/${req.id}`}
                      className="font-medium text-blue-600 hover:underline dark:text-indigo-400"
                    >
                      {req.title}
                    </Link>
                    <Badge variant={STATUS_VARIANT[req.status] ?? "outline"}>
                      {STATUS_LABELS[req.status] ?? req.status}
                    </Badge>
                  </div>
                  {req.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                      {req.description}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                  <div>Priority: {PRIORITY_LABELS[req.priorityHint] ?? req.priorityHint}</div>
                  <div>{format(new Date(req.createdAt), "MMM d")}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
