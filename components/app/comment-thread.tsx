import { listCommentsAction } from "@/lib/server-actions/comments";
import { CommentReplyForm } from "./comment-reply-form";
import { CommentItem } from "./comment-item";

export async function CommentThread({
  parentType,
  parentId,
}: {
  parentType: "daily_update" | "task";
  parentId: string;
}) {
  const r = await listCommentsAction({ parentType, parentId });
  if (!r.ok) {
    return <p className="text-sm text-red-600 dark:text-red-400">Could not load comments.</p>;
  }
  const all = r.data;
  const topLevel = all.filter((c) => c.parentCommentId === null);
  const repliesByParent = new Map<string, typeof all>();
  for (const c of all) {
    if (c.parentCommentId) {
      const arr = repliesByParent.get(c.parentCommentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentCommentId, arr);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {topLevel.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No comments yet.</p>
        ) : (
          topLevel.map((c) => (
            <div key={c.id}>
              <CommentItem comment={c} parentType={parentType} parentId={parentId} />
              {repliesByParent.get(c.id)?.map((reply) => (
                <div key={reply.id} className="ml-8 mt-2">
                  <CommentItem
                    comment={reply}
                    parentType={parentType}
                    parentId={parentId}
                    hideReply
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      <CommentReplyForm parentType={parentType} parentId={parentId} />
    </div>
  );
}
