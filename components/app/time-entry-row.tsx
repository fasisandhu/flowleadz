import { format } from "date-fns";
import Link from "next/link";

type Entry = {
  id: string;
  loggedForDate: string;
  minutes: number;
  note: string | null;
  rateCentsPerHour: number | null;
  taskId: string;
  projectId: string;
};

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${m}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

export function TimeEntryRow({
  entry,
  task,
}: {
  entry: Entry;
  task: { title: string } | undefined;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{format(new Date(entry.loggedForDate), "MMM d")}</span>
          <span className="text-slate-400 dark:text-slate-500">·</span>
          <span className="font-medium">{formatMinutes(entry.minutes)}</span>
          <span className="text-slate-400 dark:text-slate-500">·</span>
          <Link
            href={`/employee/projects/${entry.projectId}`}
            className="text-blue-600 hover:underline dark:text-indigo-400"
          >
            {task?.title ?? "(unknown task)"}
          </Link>
        </div>
        {entry.note && <div className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{entry.note}</div>}
      </div>
    </div>
  );
}
