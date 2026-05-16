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
import { logTimeAction } from "@/lib/server-actions/time-entries";

type TaskOption = { id: string; title: string };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function LogTimeForm({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: TaskOption[];
}) {
  const router = useRouter();
  const [taskId, setTaskId] = useState<string>(tasks[0]?.id ?? "");
  const [minutes, setMinutes] = useState<string>("60");
  const [loggedForDate, setLoggedForDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    const m = Number.parseInt(minutes, 10);
    if (Number.isNaN(m) || m <= 0) {
      setFieldErrors({ minutes: "Must be a positive integer" });
      setPending(false);
      return;
    }
    const r = await logTimeAction({
      taskId,
      minutes: m,
      loggedForDate,
      note: note || undefined,
    });
    setPending(false);
    if (!r.ok) {
      if (r.error.code === "validation" && r.error.fields) {
        setFieldErrors(r.error.fields);
      }
      setError(r.error.message);
      return;
    }
    router.push(`/employee/projects/${projectId}`);
  }

  if (tasks.length === 0) {
    return (
      <Alert>
        <AlertDescription>No tasks on this project to log time against.</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <Alert>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label>Task</Label>
        <Select value={taskId} onValueChange={(v) => v && setTaskId(v)}>
          <SelectTrigger>
            <SelectValue>
              {(v) => tasks.find((t) => t.id === v)?.title ?? null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {tasks.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors.taskId && <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.taskId}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="minutes">Minutes</Label>
          <Input
            id="minutes"
            type="number"
            min={1}
            step={1}
            required
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          {fieldErrors.minutes && <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.minutes}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="loggedForDate">Date</Label>
          <Input
            id="loggedForDate"
            type="date"
            required
            value={loggedForDate}
            max={todayISO()}
            onChange={(e) => setLoggedForDate(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea
          id="note"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Logging…" : "Log time"}
        </Button>
      </div>
    </form>
  );
}
