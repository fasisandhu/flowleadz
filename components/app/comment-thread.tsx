import { format } from "date-fns";
import { listCommentsAction } from "@/lib/server-actions/comments";
import { CommentReplyForm } from "./comment-reply-form";

export async function CommentThread({ dailyUpdateId }: { dailyUpdateId: string }) {
  const r = await listCommentsAction(dailyUpdateId);
  const comments = r.ok ? r.data : [];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No comments yet.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{c.userId.slice(0, 8)}</span>
                <span>{format(new Date(c.createdAt), "MMM d, yyyy h:mm a")}</span>
              </div>
              {c.deletedAt ? (
                <p className="text-sm italic text-slate-400 dark:text-slate-500">[deleted]</p>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{c.body}</p>
              )}
            </div>
          ))
        )}
      </div>
      <CommentReplyForm dailyUpdateId={dailyUpdateId} />
    </div>
  );
}
