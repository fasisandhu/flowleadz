import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getDailyUpdateAction } from "@/lib/server-actions/daily-updates";
import { CommentThread } from "@/components/app/comment-thread";
import { AttachmentList } from "@/components/app/attachment-list";

const ACTIVITY_LABELS: Record<string, string> = {
  planning: "Planning",
  execution: "Execution",
  review: "Review",
  meeting: "Meeting",
  admin: "Admin",
  other: "Other",
};

export default async function CustomerDailyUpdatePage({
  params,
}: {
  params: Promise<{ updateId: string }>;
}) {
  const { updateId } = await params;
  const r = await getDailyUpdateAction(updateId);
  if (!r.ok) {
    if (r.error.code === "not_found" || r.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{r.error.message}</p>;
  }
  const u = r.data;

  return (
    <article className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <Badge variant="secondary">{ACTIVITY_LABELS[u.activityType] ?? u.activityType}</Badge>
          <span>{format(new Date(u.logDate), "MMM d, yyyy")}</span>
        </div>
        <h1 className="text-xl font-semibold">Daily update</h1>
      </header>

      <div className="rounded-md border bg-white p-4">
        <p className="whitespace-pre-wrap text-sm text-slate-800">{u.body}</p>
      </div>

      <Separator />

      <section>
        <h2 className="mb-3 text-lg font-medium">Comments</h2>
        <CommentThread dailyUpdateId={updateId} />
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Attachments</h2>
        <AttachmentList parentType="daily_update" parentId={updateId} />
      </section>
    </article>
  );
}
