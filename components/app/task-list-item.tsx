import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
};

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

export function TaskListItem({ task }: { task: Task }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{task.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Badge variant={STATUS_VARIANT[task.status] ?? "outline"} className="text-xs">
            {STATUS_LABELS[task.status] ?? task.status}
          </Badge>
          {task.dueDate && <span>Due {format(new Date(task.dueDate), "MMM d")}</span>}
        </div>
      </div>
    </div>
  );
}
