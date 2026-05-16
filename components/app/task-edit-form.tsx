"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { adminUpdateTaskAction } from "@/lib/server-actions/admin/tasks";

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

function toDateInputValue(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function TaskEditForm({
  orgId,
  task,
}: {
  orgId: string;
  task: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    dueDate: string | Date | null;
    customerVisible: boolean;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>(
    (PRIORITIES as readonly string[]).includes(task.priority)
      ? (task.priority as (typeof PRIORITIES)[number])
      : "normal",
  );
  const [dueDate, setDueDate] = useState(toDateInputValue(task.dueDate));
  const [customerVisible, setCustomerVisible] = useState(task.customerVisible);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(
      (PRIORITIES as readonly string[]).includes(task.priority)
        ? (task.priority as (typeof PRIORITIES)[number])
        : "normal",
    );
    setDueDate(toDateInputValue(task.dueDate));
    setCustomerVisible(task.customerVisible);
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
      const r = await adminUpdateTaskAction(orgId, {
        id: task.id,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate: dueDate || null,
        customerVisible,
      });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Edit task"
      >
        <Pencil className="mr-1 h-3.5 w-3.5" />
        Edit
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
        <Label htmlFor="edit-task-title">Title</Label>
        <Input
          id="edit-task-title"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-task-description">Description</Label>
        <Textarea
          id="edit-task-description"
          rows={4}
          maxLength={10000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-task-priority">Priority</Label>
          <Select
            value={priority}
            onValueChange={(v) => v && setPriority(v as (typeof PRIORITIES)[number])}
          >
            <SelectTrigger id="edit-task-priority">
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
          <Label htmlFor="edit-task-due">Due date</Label>
          <Input
            id="edit-task-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          checked={customerVisible}
          onChange={(e) => setCustomerVisible(e.target.checked)}
        />
        Visible to customer
      </label>
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
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
