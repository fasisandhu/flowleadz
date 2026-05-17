"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CommentReplyForm } from "./comment-reply-form";
import { ReactionBar, type ReactionAggregate } from "./reaction-bar";
import {
  softDeleteCommentAction,
  adminSoftDeleteCommentAction,
  updateCommentAction,
  adminUpdateCommentAction,
} from "@/lib/server-actions/comments";

type Comment = {
  id: string;
  body: string;
  userId: string;
  parentCommentId: string | null;
  createdAt: Date | string;
  deletedAt?: Date | string | null;
  author?: { id: string; name: string | null; email: string } | null;
};

export function CommentItem({
  comment,
  parentType,
  parentId,
  hideReply,
  orgId,
  canMutate,
  initialReactions,
}: {
  comment: Comment;
  parentType: "daily_update" | "task";
  parentId: string;
  hideReply?: boolean;
  /** Pass on admin routes so the mutation hits the right org context. */
  orgId?: string;
  /** Whether the current actor can edit/delete this comment. */
  canMutate?: boolean;
  initialReactions: ReactionAggregate[];
}) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ts = format(new Date(comment.createdAt), "MMM d, yyyy h:mm a");
  const authorLabel =
    comment.author?.name?.trim() ||
    comment.author?.email ||
    comment.userId.slice(0, 8);

  function onSaveEdit() {
    setError(null);
    if (!draft.trim()) {
      setError("Body is required.");
      return;
    }
    startTransition(async () => {
      const input = { id: comment.id, body: draft.trim() };
      const r = orgId
        ? await adminUpdateCommentAction(orgId, input)
        : await updateCommentAction(input);
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm("Delete this comment?")) return;
    setError(null);
    startTransition(async () => {
      const input = { id: comment.id };
      const r = orgId
        ? await adminSoftDeleteCommentAction(orgId, input)
        : await softDeleteCommentAction(input);
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <header className="mb-1 flex items-center gap-2">
        <Avatar
          userId={comment.userId}
          name={comment.author?.name ?? null}
          email={comment.author?.email}
          size="xs"
        />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
          {authorLabel}
        </span>
        <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">{ts}</span>
        <div className="ml-auto flex items-center gap-2">
          {!hideReply && !editing && !comment.deletedAt && (
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {replying ? "Cancel" : "Reply"}
            </button>
          )}
          {canMutate && !editing && !comment.deletedAt && (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
                className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
                aria-label="Edit comment"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="text-slate-400 hover:text-red-600 disabled:opacity-50 dark:text-slate-500 dark:hover:text-red-400"
                aria-label="Delete comment"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </header>
      {comment.deletedAt ? (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">[deleted]</p>
      ) : editing ? (
        <div className="space-y-2">
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            minLength={1}
            maxLength={5000}
            required
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(false);
                setError(null);
                setDraft(comment.body);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onSaveEdit}
              disabled={pending || !draft.trim()}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
          {comment.body}
        </p>
      )}
      {!comment.deletedAt && !editing && (
        <ReactionBar commentId={comment.id} initial={initialReactions} />
      )}
      {error && !editing && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {replying && (
        <div className="mt-2">
          <CommentReplyForm
            parentType={parentType}
            parentId={parentId}
            parentCommentId={comment.id}
            orgId={orgId}
            onPosted={() => setReplying(false)}
          />
        </div>
      )}
    </div>
  );
}
