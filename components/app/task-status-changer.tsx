"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { changeTaskStatusAction } from "@/lib/server-actions/tasks";
import { adminChangeTaskStatusAction } from "@/lib/server-actions/admin/tasks";

const STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export function TaskStatusChanger({
  taskId,
  currentStatus,
  orgId,
}: {
  taskId: string;
  currentStatus: typeof STATUSES[number];
  /** Pass on admin routes so the action gets the right org context. */
  orgId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string | null) {
    if (!next || next === currentStatus) return;
    setError(null);
    startTransition(async () => {
      const input = {
        id: taskId,
        toStatus: next as typeof STATUSES[number],
      };
      const r = orgId
        ? await adminChangeTaskStatusAction(orgId, input)
        : await changeTaskStatusAction(input);
      if (!r.ok) {
        setError(r.error.message);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select value={currentStatus} onValueChange={onChange} disabled={pending}>
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue>{(v) => (typeof v === "string" ? (STATUS_LABELS[v] ?? v) : null)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
