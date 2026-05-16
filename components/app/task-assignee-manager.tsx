"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  adminAssignTaskAction,
  adminUnassignTaskAction,
} from "@/lib/server-actions/admin/tasks";

type StaffOption = { id: string; name: string };
type Assignee = { id: string; name: string | null; email: string };

export function TaskAssigneeManager({
  orgId,
  taskId,
  initialAssignees,
  staffOptions,
}: {
  orgId: string;
  taskId: string;
  initialAssignees: Assignee[];
  staffOptions: StaffOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickerValue, setPickerValue] = useState<string>("");

  const assignedIds = new Set(initialAssignees.map((a) => a.id));
  const availableOptions = staffOptions.filter((o) => !assignedIds.has(o.id));

  function onAssign(userId: string) {
    setError(null);
    startTransition(async () => {
      const r = await adminAssignTaskAction(orgId, { taskId, userId });
      if (!r.ok) setError(r.error.message);
      setPickerValue("");
      router.refresh();
    });
  }

  function onUnassign(userId: string) {
    setError(null);
    startTransition(async () => {
      const r = await adminUnassignTaskAction(orgId, { taskId, userId });
      if (!r.ok) setError(r.error.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {initialAssignees.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">No one assigned yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {initialAssignees.map((a) => (
            <li
              key={a.id}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              <span>{a.name || a.email}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => onUnassign(a.id)}
                aria-label={`Unassign ${a.name || a.email}`}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-50 dark:text-slate-500 dark:hover:text-slate-300"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {availableOptions.length > 0 && (
        <Select
          value={pickerValue}
          onValueChange={(v) => v && onAssign(v)}
          disabled={pending}
        >
          <SelectTrigger className="h-7 w-[220px] text-xs">
            <SelectValue placeholder="Assign someone…">
              {(v) => staffOptions.find((s) => s.id === v)?.name ?? null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {availableOptions.map((o) => (
              <SelectItem key={o.id} value={o.id} className="text-xs">
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
