"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  AtSign,
  CircleDot,
  FileText,
  Inbox,
  MessageCircle,
  UserPlus,
} from "lucide-react";

export type NotificationShape = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  relatedType: string | null;
  relatedId: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
  actor: { id: string; name: string | null; email: string } | null;
};

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const EVENT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "task.assigned": UserPlus,
  "task.status_changed": CircleDot,
  "daily_update.posted": FileText,
  "comment.posted": MessageCircle,
  "work_request.submitted": Inbox,
  "work_request.status_changed": Inbox,
};

const EVENT_TONE: Record<string, string> = {
  "task.assigned": "text-indigo-500",
  "task.status_changed": "text-emerald-500",
  "daily_update.posted": "text-violet-500",
  "comment.posted": "text-sky-500",
  "work_request.submitted": "text-amber-500",
  "work_request.status_changed": "text-amber-500",
};

export function describeNotification(n: NotificationShape): string {
  const actor = n.actor?.name ?? n.actor?.email ?? "Someone";
  const p = n.payload;
  const title = typeof p.title === "string" ? p.title : null;
  switch (n.eventType) {
    case "task.assigned":
      return `${actor} assigned you${title ? ` to ${title}` : " to a task"}`;
    case "task.status_changed": {
      const from = typeof p.from === "string" ? (STATUS_LABELS[p.from] ?? p.from) : null;
      const to = typeof p.to === "string" ? (STATUS_LABELS[p.to] ?? p.to) : null;
      const suffix = from && to ? ` from ${from} to ${to}` : "";
      return `${actor} changed status${title ? ` of ${title}` : ""}${suffix}`;
    }
    case "daily_update.posted":
      return `${actor} posted a daily update`;
    case "comment.posted":
      return `${actor} commented`;
    case "work_request.submitted":
      return `${actor} submitted${title ? ` "${title}"` : " a work request"}`;
    case "work_request.status_changed":
      return `${actor} updated${title ? ` "${title}"` : " a work request"}`;
    default:
      return n.eventType;
  }
}

export function NotificationRow({
  n,
  href,
}: {
  n: NotificationShape;
  href: string | null;
}) {
  const Icon = EVENT_ICON[n.eventType] ?? AtSign;
  const tone = EVENT_TONE[n.eventType] ?? "text-slate-400";
  const isUnread = !n.readAt;
  const title = describeNotification(n);
  const baseCls =
    "group relative flex items-center gap-3 border-b border-slate-200 px-4 py-3 transition last:border-b-0 dark:border-slate-800 " +
    (isUnread
      ? "bg-white hover:bg-slate-50/80 dark:bg-slate-900/60 dark:hover:bg-slate-800/40"
      : "bg-slate-50/40 hover:bg-slate-50 dark:bg-slate-900/20 dark:hover:bg-slate-800/30");
  const body = (
    <>
      {isUnread && (
        <span
          className="absolute left-0 top-0 h-full w-0.5 bg-indigo-500"
          aria-hidden="true"
        />
      )}
      <Icon className={`h-4 w-4 flex-shrink-0 ${tone}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${isUnread ? "font-medium text-slate-900 dark:text-slate-50" : "text-slate-600 dark:text-slate-300"}`}
        >
          {title}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
        </p>
      </div>
      {href && (
        <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
      )}
    </>
  );
  return href ? (
    <Link href={href} className={baseCls}>
      {body}
    </Link>
  ) : (
    <div className={baseCls}>{body}</div>
  );
}

export function NotificationListShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      {children}
    </div>
  );
}

export function NotificationEmptyState() {
  return (
    <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
      No notifications yet.
    </p>
  );
}
