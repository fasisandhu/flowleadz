"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Pencil } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UpdateEditForm } from "./update-edit-form";
import { CommentReplyForm } from "./comment-reply-form";

type CommentItemShape = {
  id: string;
  createdAt: Date | string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  body: string;
};

function relativeTime(d: Date | string) {
  return formatDistanceToNow(new Date(d), { addSuffix: true });
}

export function UpdateFeedCard({
  event,
  ts,
  taskHref,
  orgId,
  comments = [],
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
  /** Comments parented to this update — rendered nested below the body. */
  comments?: CommentItemShape[];
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);

  if (editing) {
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-none">
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

  const clickable = taskHref && !replying;

  return (
    <article
      className={
        "group relative rounded-lg border border-slate-200 bg-white p-4 transition dark:border-slate-800 dark:bg-slate-900/60 " +
        (clickable
          ? "cursor-pointer hover:border-slate-300 hover:shadow-sm dark:hover:border-slate-700"
          : "hover:border-slate-300 dark:hover:border-slate-700")
      }
    >
      {/* Absolute-positioned overlay link: makes the whole card clickable,
          while interactive children (buttons, the View-task link) sit on a
          higher stacking layer via `relative z-10` and intercept clicks. */}
      {clickable && (
        <Link
          href={taskHref}
          className="absolute inset-0 rounded-lg"
          aria-label="Open task"
        />
      )}

      <header className="relative z-10 mb-2 flex items-center gap-2">
        <Avatar
          userId={event.authorId}
          name={event.authorName}
          email={event.authorEmail}
          size="sm"
        />
        <span className="text-sm font-medium text-slate-900 group-hover:text-indigo-600 dark:text-slate-50 dark:group-hover:text-indigo-400">
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
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="relative z-10 ml-auto cursor-pointer text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
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

      {comments.length > 0 && (
        <ul className="relative z-10 mt-3 space-y-2 border-l border-slate-200 pl-3 dark:border-slate-700">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              <Avatar
                userId={c.authorId}
                name={c.authorName}
                email={c.authorEmail}
                size="xs"
              />
              <div className="min-w-0 flex-1">
                <span className="font-medium text-slate-900 dark:text-slate-50">
                  {c.authorName || c.authorEmail}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {" · "}
                  {relativeTime(c.createdAt)}
                </span>
                <p className="mt-0.5 whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                  {c.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="relative z-10 mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 cursor-pointer px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setReplying((v) => !v);
          }}
        >
          <MessageCircle className="mr-1 h-3 w-3" />
          {replying ? "Cancel" : "Comment"}
        </Button>
        {taskHref && (
          <Link
            href={taskHref}
            className="ml-auto text-slate-500 transition hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
          >
            View task →
          </Link>
        )}
      </footer>
      {replying && (
        <div className="relative z-10 mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
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
