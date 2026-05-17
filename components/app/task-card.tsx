"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, MessageCircle, Clock, Paperclip } from "lucide-react";
import { AvatarStack } from "@/components/ui/avatar";
import { TaskStatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { CommentReplyForm } from "./comment-reply-form";
import type { TaskStatus } from "@/lib/constants/status";

export type TaskCardData = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | Date | null;
  lastActivitySnippet: string | null;
  lastActivityAt: Date | string | null;
  commentCount: number;
  totalMinutes: number;
  attachmentCount: number;
  assignees: { id: string; name: string | null; email: string }[];
};

function formatMinutes(m: number): string {
  if (m === 0) return "";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${m}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

export function TaskCard({
  task,
  href,
  orgId,
  enableQuickReply = false,
}: {
  task: TaskCardData;
  href: string;
  /** Pass on admin routes so the inline reply uses the right context. */
  orgId?: string;
  /** Render an inline "Comment" affordance that opens a composer per card. */
  enableQuickReply?: boolean;
}) {
  const [replyOpen, setReplyOpen] = useState(false);

  return (
    <article className="rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700">
      <div className="flex items-center gap-3">
        <TaskStatusPill status={task.status} />
        <Link
          href={href}
          className="group flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-50"
        >
          <span className="min-w-0 flex-1 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
            {task.title}
          </span>
          <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
        </Link>
      </div>

      {task.lastActivitySnippet && (
        <p className="ml-[88px] mt-1.5 line-clamp-1 text-xs italic text-slate-500 dark:text-slate-400">
          &ldquo;{task.lastActivitySnippet}&rdquo;
        </p>
      )}

      {(task.assignees.length > 0 ||
        task.commentCount > 0 ||
        task.totalMinutes > 0 ||
        task.attachmentCount > 0 ||
        task.dueDate ||
        enableQuickReply) && (
        <div className="ml-[88px] mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {task.assignees.length > 0 && (
            <AvatarStack
              users={task.assignees.map((a) => ({ id: a.id, name: a.name, email: a.email }))}
              size="xs"
              max={3}
            />
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <MessageCircle className="h-3 w-3" />
              {task.commentCount}
            </span>
          )}
          {task.totalMinutes > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="h-3 w-3" />
              {formatMinutes(task.totalMinutes)}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Paperclip className="h-3 w-3" />
              {task.attachmentCount}
            </span>
          )}
          {task.dueDate && (
            <span className="ml-auto tabular-nums">
              Due {format(new Date(task.dueDate), "MMM d")}
            </span>
          )}
          {enableQuickReply && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setReplyOpen((v) => !v)}
            >
              <MessageCircle className="mr-1 h-3 w-3" />
              {replyOpen ? "Cancel" : "Reply"}
            </Button>
          )}
        </div>
      )}

      {enableQuickReply && replyOpen && (
        <div className="ml-[88px] mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <CommentReplyForm
            parentType="task"
            parentId={task.id}
            orgId={orgId}
            onPosted={() => setReplyOpen(false)}
          />
        </div>
      )}
    </article>
  );
}
