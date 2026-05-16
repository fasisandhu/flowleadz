"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Pencil } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UpdateEditForm } from "./update-edit-form";
import { CommentReplyForm } from "./comment-reply-form";

export function UpdateFeedCard({
  event,
  ts,
  taskHref,
  orgId,
}: {
  event: {
    id: string;
    authorId: string;
    authorName: string;
    authorEmail: string;
    body: string;
    activityType: string;
    visibility: "customer_visible" | "internal_only";
    canEdit: boolean;
  };
  ts: string;
  taskHref?: string;
  /** Pass on admin routes so the inline reply uses the right org context. */
  orgId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);

  if (editing) {
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
        <UpdateEditForm
          updateId={event.id}
          initialBody={event.body}
          initialActivityType={event.activityType}
          initialVisibility={event.visibility}
          onDone={() => setEditing(false)}
        />
      </article>
    );
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <header className="mb-2 flex items-center gap-2">
        <Avatar
          userId={event.authorId}
          name={event.authorName}
          email={event.authorEmail}
          size="sm"
        />
        <span className="text-sm font-medium text-slate-900 dark:text-slate-50">
          {event.authorName || event.authorEmail}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          posted an update · {ts}
        </span>
        {event.visibility === "internal_only" && (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Internal
          </span>
        )}
        {event.canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
            aria-label="Edit update"
            title="Edit update"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </header>
      <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
        {event.body}
      </p>
      <footer className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setReplying((v) => !v)}
        >
          <MessageCircle className="mr-1 h-3 w-3" />
          {replying ? "Cancel" : "Comment"}
        </Button>
        {taskHref && (
          <Link href={taskHref} className="ml-auto hover:underline">
            View task →
          </Link>
        )}
      </footer>
      {replying && (
        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          <CommentReplyForm
            parentType="daily_update"
            parentId={event.id}
            orgId={orgId}
            onPosted={() => setReplying(false)}
          />
        </div>
      )}
    </article>
  );
}
