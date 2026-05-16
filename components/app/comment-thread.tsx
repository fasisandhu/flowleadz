import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/config";
import { listCommentsAction } from "@/lib/server-actions/comments";
import { listReactionsForCommentAction } from "@/lib/server-actions/reactions";
import type { ReactionAggregate } from "@/lib/services/reactions";
import { CommentReplyForm } from "./comment-reply-form";
import { CommentItem } from "./comment-item";

export async function CommentThread({
  parentType,
  parentId,
  orgId,
}: {
  parentType: "daily_update" | "task";
  parentId: string;
  /** Pass on admin routes so mutation actions use the right org context. */
  orgId?: string;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const currentUserId = session?.user?.id ?? null;
  const currentRole = (session?.user as { systemRole?: string } | undefined)?.systemRole ?? null;
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

  // Fetch reactions for all comments in parallel
  const reactionResults = await Promise.all(
    all.map((c) => listReactionsForCommentAction(c.id)),
  );
  const reactionMap = new Map<string, ReactionAggregate[]>();
  all.forEach((c, i) => {
    const res = reactionResults[i]!;
    reactionMap.set(c.id, res.ok ? res.data : []);
  });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {topLevel.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No comments yet.</p>
        ) : (
          topLevel.map((c) => (
            <div key={c.id}>
              <CommentItem
                comment={c}
                parentType={parentType}
                parentId={parentId}
                orgId={orgId}
                canMutate={
                  currentUserId === c.userId || currentRole === "admin"
                }
                initialReactions={reactionMap.get(c.id) ?? []}
              />
              {repliesByParent.get(c.id)?.map((reply) => (
                <div key={reply.id} className="ml-8 mt-2">
                  <CommentItem
                    comment={reply}
                    parentType={parentType}
                    parentId={parentId}
                    orgId={orgId}
                    canMutate={
                      currentUserId === reply.userId || currentRole === "admin"
                    }
                    hideReply
                    initialReactions={reactionMap.get(reply.id) ?? []}
                  />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      <CommentReplyForm parentType={parentType} parentId={parentId} orgId={orgId} />
    </div>
  );
}
