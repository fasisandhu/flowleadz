import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getDailyUpdateAction } from "@/lib/server-actions/daily-updates";
import { CommentThread } from "@/components/app/comment-thread";
import { AttachmentList } from "@/components/app/attachment-list";
import { AttachmentUpload } from "@/components/app/attachment-upload";

const ACTIVITY_LABELS: Record<string, string> = {
  planning: "Planning",
  execution: "Execution",
  review: "Review",
  meeting: "Meeting",
  admin: "Admin",
  other: "Other",
};

const VISIBILITY_LABELS: Record<string, string> = {
  customer_visible: "Visible to customer",
  internal_only: "Internal only",
};

export default async function EmployeeDailyUpdatePage({
  params,
}: {
  params: Promise<{ updateId: string }>;
}) {
  const { updateId } = await params;
  const r = await getDailyUpdateAction(updateId);
  if (!r.ok) {
    if (r.error.code === "not_found" || r.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600 dark:text-red-400">{r.error.message}</p>;
  }
  const u = r.data;

  return (
    <article className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Badge variant="secondary">{ACTIVITY_LABELS[u.activityType] ?? u.activityType}</Badge>
          <Badge variant={u.visibility === "internal_only" ? "outline" : "default"}>
            {VISIBILITY_LABELS[u.visibility] ?? u.visibility}
          </Badge>
          <span>{format(new Date(u.logDate), "MMM d, yyyy")}</span>
        </div>
        <h1 className="text-xl font-semibold">Daily update</h1>
      </header>

      <div className="rounded-md border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{u.body}</p>
      </div>

      <Separator />

      <section>
        <h2 className="mb-3 text-lg font-medium">Comments</h2>
        <CommentThread parentType="daily_update" parentId={updateId} />
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Attachments</h2>
        <AttachmentList parentType="daily_update" parentId={updateId} />
        <AttachmentUpload parentType="daily_update" parentId={updateId} />
      </section>
    </article>
  );
}
