"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
const ACTIVITY_LABELS: Record<string, string> = {
  planning: "Planning",
  execution: "Execution",
  review: "Review",
  meeting: "Meeting",
  admin: "Admin",
  other: "Other",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function PostUpdateForm({
  projectId,
  taskId,
  onPosted,
}: {
  projectId: string;
  taskId: string;
  onPosted?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [activityType, setActivityType] = useState<(typeof ACTIVITIES)[number]>("execution");
  const [visibility, setVisibility] = useState<"customer_visible" | "internal_only">(
    "customer_visible",
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!body.trim()) {
      setError("Update body is required.");
      return;
    }
    startTransition(async () => {
      const r = await createDailyUpdateAction({
        projectId,
        body,
        activityType,
        visibility,
        logDate: todayISO(),
        taskIds: [taskId],
      });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setBody("");
      onPosted?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="update-body">Post an update</Label>
        <Textarea
          id="update-body"
          rows={3}
          required
          minLength={1}
          maxLength={20000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did you work on?"
        />
      </div>

      {showAdvanced && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="update-activity">Activity</Label>
            <Select
              value={activityType}
              onValueChange={(v) => v && setActivityType(v as (typeof ACTIVITIES)[number])}
            >
              <SelectTrigger id="update-activity">
                <SelectValue>
                  {(v) => (typeof v === "string" ? (ACTIVITY_LABELS[v] ?? v) : null)}
                </SelectValue>
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
            <Label htmlFor="update-visibility">Visibility</Label>
            <Select
              value={visibility}
              onValueChange={(v) => v && setVisibility(v as "customer_visible" | "internal_only")}
            >
              <SelectTrigger id="update-visibility">
                <SelectValue>
                  {(v) =>
                    v === "customer_visible"
                      ? "Visible to customer"
                      : v === "internal_only"
                        ? "Internal only"
                        : null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer_visible">Visible to customer</SelectItem>
                <SelectItem value="internal_only">Internal only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {showAdvanced ? "Hide options" : "More options"}
        </button>
        <Button type="submit" disabled={pending}>
          {pending ? "Posting…" : "Post update"}
        </Button>
      </div>
    </form>
  );
}
