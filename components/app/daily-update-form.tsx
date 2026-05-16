"use client";

import { useState } from "react";
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
import { createDailyUpdateAction } from "@/lib/server-actions/daily-updates";

const ACTIVITIES = ["planning", "execution", "review", "meeting", "admin", "other"] as const;
const VISIBILITIES = ["customer_visible", "internal_only"] as const;

const ACTIVITY_LABELS: Record<string, string> = {
  planning: "Planning",
  execution: "Execution",
  review: "Review",
  meeting: "Meeting",
  admin: "Admin",
  other: "Other",
};

const VISIBILITY_LABELS: Record<string, string> = {
  customer_visible: "Visible to customer",
  internal_only: "Internal only",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type TaskOption = { id: string; title: string };

export function DailyUpdateForm({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: TaskOption[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [activityType, setActivityType] = useState<(typeof ACTIVITIES)[number]>("execution");
  const [visibility, setVisibility] = useState<(typeof VISIBILITIES)[number]>("customer_visible");
  const [logDate, setLogDate] = useState(todayISO());
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    const r = await createDailyUpdateAction({
      projectId,
      body,
      activityType,
      visibility,
      logDate,
      taskIds: taskIds.length > 0 ? taskIds : undefined,
    });
    setPending(false);
    if (!r.ok) {
      if (r.error.code === "validation" && r.error.fields) {
        setFieldErrors(r.error.fields);
      }
      setError(r.error.message);
      return;
    }
    router.push(`/employee/projects/${projectId}/updates/${r.data.id}`);
  }

  function toggleTask(id: string) {
    setTaskIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <Alert>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="body">What happened today?</Label>
        <Textarea
          id="body"
          rows={6}
          required
          minLength={1}
          maxLength={20000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {fieldErrors.body && <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.body}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Activity</Label>
          <Select
            value={activityType}
            onValueChange={(v) => v && setActivityType(v as (typeof ACTIVITIES)[number])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITIES.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTIVITY_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Visibility</Label>
          <Select
            value={visibility}
            onValueChange={(v) => v && setVisibility(v as (typeof VISIBILITIES)[number])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISIBILITIES.map((v) => (
                <SelectItem key={v} value={v}>
                  {VISIBILITY_LABELS[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="logDate">Log date</Label>
        <Input
          id="logDate"
          type="date"
          required
          value={logDate}
          max={todayISO()}
          onChange={(e) => setLogDate(e.target.value)}
        />
        {fieldErrors.logDate && <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.logDate}</p>}
      </div>

      {tasks.length > 0 && (
        <div className="space-y-2">
          <Label>Linked tasks (optional)</Label>
          <div className="max-h-48 space-y-1 overflow-auto rounded-md border bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            {tasks.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={taskIds.includes(t.id)}
                  onChange={() => toggleTask(t.id)}
                />
                {t.title}
              </label>
            ))}
          </div>
          {fieldErrors.taskIds && <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.taskIds}</p>}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Posting…" : "Post update"}
        </Button>
      </div>
    </form>
  );
}
