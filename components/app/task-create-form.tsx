"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus } from "lucide-react";
import { adminCreateTaskAction, adminAssignTaskAction } from "@/lib/server-actions/admin/tasks";

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

type StaffOption = { id: string; name: string };

export function TaskCreateForm({
  orgId,
  projectId,
  staffOptions = [],
}: {
  orgId: string;
  projectId: string;
  /** Optional list of staff who can be assigned at create-time. */
  staffOptions?: StaffOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("normal");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("normal");
    setDueDate("");
    setAssigneeId("");
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    startTransition(async () => {
      const r = await adminCreateTaskAction(orgId, {
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
      });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      // Best-effort assign after create. Failure surfaces but doesn't
      // erase the new task — the admin can still assign from the detail.
      if (assigneeId) {
        const ar = await adminAssignTaskAction(orgId, {
          taskId: r.data.id,
          userId: assigneeId,
        });
        if (!ar.ok) {
          setError(`Task created but assignment failed: ${ar.error.message}`);
          router.refresh();
          return;
        }
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        New task
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="task-title">Title</Label>
        <Input
          id="task-title"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to get done?"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="task-description">Description (optional)</Label>
        <Textarea
          id="task-description"
          rows={3}
          maxLength={10000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add context, acceptance criteria, links…"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="task-priority">Priority</Label>
          <Select
            value={priority}
            onValueChange={(v) => v && setPriority(v as (typeof PRIORITIES)[number])}
          >
            <SelectTrigger id="task-priority">
              <SelectValue>
                {(v) => (typeof v === "string" ? (PRIORITY_LABELS[v] ?? v) : null)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-due">Due date (optional)</Label>
          <Input
            id="task-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        {staffOptions.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="task-assignee">Assignee (optional)</Label>
            <Select
              value={assigneeId}
              onValueChange={(v) => setAssigneeId(v ?? "")}
            >
              <SelectTrigger id="task-assignee">
                <SelectValue placeholder="Unassigned">
                  {(v) => staffOptions.find((s) => s.id === v)?.name ?? null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Creating…" : "Create task"}
        </Button>
      </div>
    </form>
  );
}
