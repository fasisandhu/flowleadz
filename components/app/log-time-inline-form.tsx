"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { logTimeAction } from "@/lib/server-actions/time-entries";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function LogTimeInlineForm({
  taskId,
  onLogged,
}: {
  taskId: string;
  onLogged?: () => void;
}) {
  const router = useRouter();
  const [minutes, setMinutes] = useState("60");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const m = Number.parseInt(minutes, 10);
    if (Number.isNaN(m) || m <= 0) {
      setError("Minutes must be a positive integer.");
      return;
    }
    startTransition(async () => {
      const r = await logTimeAction({
        taskId,
        minutes: m,
        loggedForDate: date,
        note: note || undefined,
      });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setMinutes("60");
      setNote("");
      onLogged?.();
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
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="log-minutes">Minutes</Label>
          <Input
            id="log-minutes"
            type="number"
            min={1}
            step={1}
            required
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="log-date">Date</Label>
          <Input
            id="log-date"
            type="date"
            required
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-2 md:col-span-1">
          <Label htmlFor="log-note">Note (optional)</Label>
          <Input
            id="log-note"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Logging…" : "Log time"}
        </Button>
      </div>
    </form>
  );
}
