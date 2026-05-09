import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { TaskStatusChanger } from "@/components/app/task-status-changer";

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  todo: "outline",
  in_progress: "default",
  blocked: "destructive",
  done: "secondary",
  cancelled: "secondary",
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

  const r = await listTasksAction({});
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
              filter === f ? "border-blue-500 bg-blue-50 text-blue-700" : "hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "All" : f === "open" ? "Open" : STATUS_LABELS[f]}
          </Link>
        ))}
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500">No tasks match.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <Badge variant={STATUS_VARIANT[t.status] ?? "outline"} className="text-xs">
                      {STATUS_LABELS[t.status] ?? t.status}
                    </Badge>
                    {t.dueDate && <span>Due {format(new Date(t.dueDate), "MMM d")}</span>}
                    {t.projectId && (
                      <Link
                        href={`/employee/projects/${t.projectId}`}
                        className="text-blue-600 hover:underline"
                      >
                        View project
                      </Link>
                    )}
                  </div>
                </div>
                <TaskStatusChanger
                  taskId={t.id}
                  currentStatus={t.status as "todo" | "in_progress" | "blocked" | "done" | "cancelled"}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
