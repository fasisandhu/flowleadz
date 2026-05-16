"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommentReplyForm } from "./comment-reply-form";

type Update = {
  id: string;
  projectId: string;
  body: string;
  activityType: string;
  visibility: string;
  logDate: string;
  createdAt: Date | string;
};

const ACTIVITY_LABELS: Record<string, string> = {
  planning: "Planning",
  execution: "Execution",
  review: "Review",
  meeting: "Meeting",
  admin: "Admin",
  other: "Other",
};

const ACTIVITY_DOT: Record<string, string> = {
  planning: "bg-violet-500",
  execution: "bg-indigo-500",
  review: "bg-emerald-500",
  meeting: "bg-amber-500",
  admin: "bg-slate-400",
  other: "bg-slate-400",
};

export function DailyUpdateCard({
  update,
  hrefBase = "/customer/projects",
  orgId,
}: {
  update: Update;
  hrefBase?: string;
  /** Pass on admin routes so the comment action uses the right context. */
  orgId?: string;
}) {
  const href = `${hrefBase}/${update.projectId}/updates/${update.id}`;
  const logDateLabel = format(new Date(update.logDate), "MMM d");
  const preview = update.body.length > 240 ? `${update.body.slice(0, 240)}…` : update.body;
  const [replyOpen, setReplyOpen] = useState(false);

  return (
    <article className="group rounded-lg border border-slate-200 bg-white transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700">
      <div className="flex items-start justify-between gap-4 px-4 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span
            className={`h-1.5 w-1.5 rounded-full ${ACTIVITY_DOT[update.activityType] ?? "bg-slate-400"}`}
            aria-hidden="true"
          />
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {ACTIVITY_LABELS[update.activityType] ?? update.activityType}
          </span>
          <span className="text-slate-400 dark:text-slate-500">·</span>
          <span className="text-slate-500 dark:text-slate-400">{logDateLabel}</span>
          {update.visibility === "internal_only" && (
            <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Internal
            </span>
          )}
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-0.5 text-xs text-slate-500 transition hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
        >
          Open
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="px-4 pb-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {preview}
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 dark:border-slate-800">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          onClick={() => setReplyOpen((v) => !v)}
        >
          <MessageCircle className="mr-1 h-3 w-3" />
          {replyOpen ? "Cancel" : "Reply"}
        </Button>
      </div>
      {replyOpen && (
        <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          <CommentReplyForm
            parentType="daily_update"
            parentId={update.id}
            orgId={orgId}
            onPosted={() => setReplyOpen(false)}
          />
        </div>
      )}
    </article>
  );
}
