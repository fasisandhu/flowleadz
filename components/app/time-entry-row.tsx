"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateTimeEntryAction,
  deleteTimeEntryAction,
} from "@/lib/server-actions/time-entries";

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
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [minutes, setMinutes] = useState(String(entry.minutes));
  const [date, setDate] = useState(entry.loggedForDate);
  const [note, setNote] = useState(entry.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave() {
    setError(null);
    const m = Number.parseInt(minutes, 10);
    if (Number.isNaN(m) || m <= 0) {
      setError("Minutes must be a positive integer.");
      return;
    }
    startTransition(async () => {
      const r = await updateTimeEntryAction({
        id: entry.id,
        minutes: m,
        loggedForDate: date,
        note: note.trim() || null,
      });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm("Delete this time entry?")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteTimeEntryAction({ id: entry.id });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="rounded-md border bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        {error && (
          <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="grid gap-2 md:grid-cols-3">
          <Input
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            aria-label="Minutes"
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="Note"
            aria-label="Note"
          />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(false);
              setError(null);
              setMinutes(String(entry.minutes));
              setDate(entry.loggedForDate);
              setNote(entry.note ?? "");
            }}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    );
  }

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
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <div className="ml-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          aria-label="Edit time entry"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-slate-500 dark:hover:bg-red-950 dark:hover:text-red-400"
          aria-label="Delete time entry"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
