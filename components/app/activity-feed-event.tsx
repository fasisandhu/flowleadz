import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { CircleDot, Clock, MessageCircle, Paperclip, RefreshCw } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { TaskStatusPill } from "@/components/ui/status-pill";
import type { ActivityEvent } from "@/lib/services/tasks";

function relativeTime(d: Date | string) {
  return formatDistanceToNow(new Date(d), { addSuffix: true });
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${m}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

export function ActivityFeedEvent({
  event,
  taskHref,
}: {
  event: ActivityEvent;
  taskHref?: string;
}) {
  const ts = relativeTime(event.createdAt);

  switch (event.kind) {
    case "update":
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
            <span className="text-xs text-slate-500 dark:text-slate-400">posted an update · {ts}</span>
            {event.visibility === "internal_only" && (
              <span className="ml-auto rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                Internal
              </span>
            )}
          </header>
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{event.body}</p>
          {taskHref && (
            <footer className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              <Link href={taskHref} className="hover:underline">
                View task →
              </Link>
            </footer>
          )}
        </article>
      );

    case "comment":
      return (
        <div className="flex items-start gap-2 pl-6 text-sm">
          <MessageCircle className="mt-0.5 hidden h-4 w-4 text-slate-400 dark:text-slate-500 sm:inline-block" aria-hidden="true" />
          <Avatar
            userId={event.authorId}
            name={event.authorName}
            email={event.authorEmail}
            size="xs"
          />
          <div className="min-w-0 flex-1">
            <span className="font-medium text-slate-900 dark:text-slate-50">
              {event.authorName || event.authorEmail}
            </span>
            <span className="text-slate-500 dark:text-slate-400"> · {ts}</span>
            <p className="mt-0.5 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{event.body}</p>
          </div>
        </div>
      );

    case "status_change":
      return (
        <div className="flex items-center gap-2 text-sm">
          <CircleDot className="hidden h-4 w-4 text-slate-400 dark:text-slate-500 sm:inline-block" aria-hidden="true" />
          <Avatar
            userId={event.actorId}
            name={event.actorName}
            email={event.actorEmail}
            size="xs"
          />
          <span className="text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-900 dark:text-slate-50">
              {event.actorName || event.actorEmail}
            </span>{" "}
            {event.fromStatus === null ? "created task with status" : "changed status:"}
          </span>
          {event.fromStatus !== null && (
            <>
              <TaskStatusPill status={event.fromStatus} />
              <RefreshCw className="h-3 w-3 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            </>
          )}
          <TaskStatusPill status={event.toStatus} />
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{ts}</span>
        </div>
      );

    case "time_log":
      return (
        <div className="flex items-center gap-2 text-sm">
          <Clock className="hidden h-4 w-4 text-slate-400 dark:text-slate-500 sm:inline-block" aria-hidden="true" />
          <Avatar
            userId={event.actorId}
            name={event.actorName}
            email={event.actorEmail}
            size="xs"
          />
          <span className="text-slate-700 dark:text-slate-200">
            <span className="font-medium text-slate-900 dark:text-slate-50">
              {event.actorName || event.actorEmail}
            </span>{" "}
            logged <span className="font-medium">{formatMinutes(event.minutes)}</span>
          </span>
          {event.note && <span className="text-slate-500 dark:text-slate-400">— {event.note}</span>}
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{ts}</span>
        </div>
      );

    case "attachment":
      return (
        <div className="flex items-center gap-2 text-sm">
          <Paperclip className="hidden h-4 w-4 text-slate-400 dark:text-slate-500 sm:inline-block" aria-hidden="true" />
          <Avatar
            userId={event.uploaderId}
            name={event.uploaderName}
            email={event.uploaderEmail}
            size="xs"
          />
          <span className="text-slate-700 dark:text-slate-200">
            <span className="font-medium text-slate-900 dark:text-slate-50">
              {event.uploaderName || event.uploaderEmail}
            </span>{" "}
            attached{" "}
            <span className="font-medium">{event.filename}</span>
          </span>
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{ts}</span>
        </div>
      );
  }
}

export function ActivityDayDivider({ date }: { date: Date | string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {format(new Date(date), "MMM d, yyyy")}
      </span>
      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}
