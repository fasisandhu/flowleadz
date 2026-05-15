import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getWorkRequestAction } from "@/lib/server-actions/work-requests";
import { AttachmentList } from "@/components/app/attachment-list";
import { AttachmentUpload } from "@/components/app/attachment-upload";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted — awaiting review",
  accepted: "Accepted",
  rejected: "Rejected",
  duplicate: "Marked as duplicate",
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
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{req.title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Submitted {format(new Date(req.createdAt), "MMM d, yyyy h:mm a")}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[req.status] ?? "outline"}>
          {STATUS_LABELS[req.status] ?? req.status}
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Priority:</span>{" "}
            {PRIORITY_LABELS[req.priorityHint] ?? req.priorityHint}
          </div>
          {req.description && (
            <div>
              <div className="mb-1 text-slate-500 dark:text-slate-400">Description</div>
              <p className="whitespace-pre-wrap">{req.description}</p>
            </div>
          )}
          {req.rejectionReason && (
            <div>
              <div className="mb-1 text-slate-500 dark:text-slate-400">
                {req.status === "duplicate" ? "Note" : "Reason"}
              </div>
              <p className="whitespace-pre-wrap">{req.rejectionReason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Attachments</h2>
        <AttachmentList parentType="work_request" parentId={requestId} />
        <AttachmentUpload parentType="work_request" parentId={requestId} />
      </section>
    </div>
  );
}
