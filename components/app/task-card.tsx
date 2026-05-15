import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, MessageCircle, Clock, Paperclip } from "lucide-react";
import { AvatarStack } from "@/components/ui/avatar";
import { TaskStatusPill } from "@/components/ui/status-pill";
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

export function TaskCard({ task, href }: { task: TaskCardData; href: string }) {
  return (
    <Link
      href={href}
      className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:shadow-none dark:hover:border-slate-600"
    >
      <div className="flex items-start gap-3">
        <TaskStatusPill status={task.status} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-50">
          {task.title}
        </h3>
        <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300" />
      </div>

      {task.lastActivitySnippet && (
        <p className="mt-2 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
          &ldquo;{task.lastActivitySnippet}&rdquo;
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        {task.assignees.length > 0 && (
          <AvatarStack
            users={task.assignees.map((a) => ({ id: a.id, name: a.name, email: a.email }))}
            size="xs"
            max={3}
          />
        )}
        {task.commentCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3 w-3" />
            {task.commentCount}
          </span>
        )}
        {task.totalMinutes > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatMinutes(task.totalMinutes)}
          </span>
        )}
        {task.attachmentCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            {task.attachmentCount}
          </span>
        )}
        {task.dueDate && (
          <span className="ml-auto">
            Due {format(new Date(task.dueDate), "MMM d")}
          </span>
        )}
      </div>
    </Link>
  );
}
