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
import { updateDailyUpdateAction } from "@/lib/server-actions/daily-updates";

const ACTIVITIES = ["planning", "execution", "review", "meeting", "admin", "other"] as const;
const ACTIVITY_LABELS: Record<string, string> = {
  planning: "Planning",
  execution: "Execution",
  review: "Review",
  meeting: "Meeting",
  admin: "Admin",
  other: "Other",
};

export function UpdateEditForm({
  updateId,
  initialBody,
  initialActivityType,
  initialVisibility,
  onDone,
}: {
  updateId: string;
  initialBody: string;
  initialActivityType: string;
  initialVisibility: "customer_visible" | "internal_only";
  onDone: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [activityType, setActivityType] = useState<(typeof ACTIVITIES)[number]>(
    initialActivityType as (typeof ACTIVITIES)[number],
  );
  const [visibility, setVisibility] = useState<"customer_visible" | "internal_only">(
    initialVisibility,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!body.trim()) {
      setError("Body is required.");
      return;
    }
    startTransition(async () => {
      const r = await updateDailyUpdateAction({
        id: updateId,
        body,
        activityType,
        visibility,
      });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSave} className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor={`edit-body-${updateId}`}>Body</Label>
        <Textarea
          id={`edit-body-${updateId}`}
          rows={4}
          required
          minLength={1}
          maxLength={20000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`edit-activity-${updateId}`}>Activity</Label>
          <Select
            value={activityType}
            onValueChange={(v) => v && setActivityType(v as (typeof ACTIVITIES)[number])}
          >
            <SelectTrigger id={`edit-activity-${updateId}`}>
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
          <Label htmlFor={`edit-visibility-${updateId}`}>Visibility</Label>
          <Select
            value={visibility}
            onValueChange={(v) =>
              v && setVisibility(v as "customer_visible" | "internal_only")
            }
          >
            <SelectTrigger id={`edit-visibility-${updateId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="customer_visible">Visible to customer</SelectItem>
              <SelectItem value="internal_only">Internal only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
