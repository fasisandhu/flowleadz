"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listDailyUpdateRevisionsAction } from "@/lib/server-actions/daily-updates";

type Revision = {
  id: string;
  body: string;
  activityType: string;
  visibility: string;
  editedAt: Date | string;
  editedBy: string;
};

export function UpdateHistory({ updateId }: { updateId: string }) {
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpen() {
    setOpen(true);
    if (revisions !== null) return;
    setError(null);
    startTransition(async () => {
      const r = await listDailyUpdateRevisionsAction(updateId);
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setRevisions(r.data as Revision[]);
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
        <History className="mr-1 h-3.5 w-3.5" />
        Edit history
      </Button>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">Edit history</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {pending && <p className="text-xs text-slate-500 dark:text-slate-400">Loading…</p>}
      {revisions && revisions.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">No prior versions.</p>
      )}
      {revisions && revisions.length > 0 && (
        <ul className="space-y-3">
          {revisions.map((r) => (
            <li key={r.id} className="border-l-2 border-slate-200 pl-3 dark:border-slate-700">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {format(new Date(r.editedAt), "MMM d, yyyy h:mm a")} · {r.activityType} · {r.visibility}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                {r.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
