"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { CommentReplyForm } from "./comment-reply-form";

type Comment = {
  id: string;
  body: string;
  userId: string;
  parentCommentId: string | null;
  createdAt: Date | string;
  deletedAt?: Date | string | null;
};

export function CommentItem({
  comment,
  parentType,
  parentId,
  hideReply,
}: {
  comment: Comment;
  parentType: "daily_update" | "task";
  parentId: string;
  hideReply?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const ts = format(new Date(comment.createdAt), "MMM d, yyyy h:mm a");

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <header className="mb-1 flex items-center gap-2">
        <Avatar userId={comment.userId} size="xs" />
        <span className="text-xs text-slate-500 dark:text-slate-400">{comment.userId.slice(0, 8)}</span>
        <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">{ts}</span>
        {!hideReply && (
          <button
            type="button"
            onClick={() => setReplying((v) => !v)}
            className="ml-auto text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {replying ? "Cancel" : "Reply"}
          </button>
        )}
      </header>
      {comment.deletedAt ? (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">[deleted]</p>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
          {comment.body}
        </p>
      )}
      {replying && (
        <div className="mt-2">
          <CommentReplyForm
            parentType={parentType}
            parentId={parentId}
            parentCommentId={comment.id}
            onPosted={() => setReplying(false)}
          />
        </div>
      )}
    </div>
  );
}
