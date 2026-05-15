import Link from "next/link";
import { listTasksWithCardDataAction } from "@/lib/server-actions/tasks";
import { TaskCard } from "@/components/app/task-card";

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const FILTERS = ["all", "open", "todo", "in_progress", "blocked", "done", "cancelled"] as const;

export default async function EmployeeTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as typeof FILTERS[number])
    : "open";

  const r = await listTasksWithCardDataAction({});
  let tasks = r.ok ? r.data : [];
  if (filter === "open") {
    tasks = tasks.filter((t) => ["todo", "in_progress", "blocked"].includes(t.status));
  } else if (filter !== "all") {
    tasks = tasks.filter((t) => t.status === filter);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My tasks</h1>
      </div>

      <div className="flex flex-wrap gap-1 text-xs">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/employee/tasks?status=${f}`}
            className={`rounded-full border px-3 py-1 ${
              filter === f ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-300" : "hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {f === "all" ? "All" : f === "open" ? "Open" : STATUS_LABELS[f]}
          </Link>
        ))}
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No tasks match.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} href={`/employee/tasks/${t.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
