"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { upsertNotificationPreferenceAction } from "@/lib/server-actions/notifications";

const EVENT_TYPES = [
  { key: "task.assigned", label: "Task assigned to me" },
  { key: "task.status_changed", label: "Task status changed" },
  { key: "daily_update.posted", label: "New daily update" },
  { key: "comment.posted", label: "New comment" },
  { key: "work_request.submitted", label: "Work request submitted" },
  { key: "work_request.status_changed", label: "Work request status changed" },
] as const;

type Pref = { eventType: string; inAppEnabled: boolean; emailEnabled: boolean };

export function NotificationPreferences({ initial }: { initial: Pref[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [prefs, setPrefs] = useState<Record<string, { inApp: boolean; email: boolean }>>(() => {
    const m: Record<string, { inApp: boolean; email: boolean }> = {};
    for (const e of EVENT_TYPES) {
      const row = initial.find((p) => p.eventType === e.key);
      m[e.key] = {
        inApp: row?.inAppEnabled ?? true,
        email: row?.emailEnabled ?? true,
      };
    }
    return m;
  });

  function toggle(eventType: string, channel: "inApp" | "email", value: boolean) {
    const next = { ...prefs[eventType]!, [channel]: value };
    setPrefs((p) => ({ ...p, [eventType]: next }));
    setError(null);
    startTransition(async () => {
      const r = await upsertNotificationPreferenceAction({
        eventType,
        inAppEnabled: next.inApp,
        emailEnabled: next.email,
      });
      if (!r.ok) {
        setError(r.error.message);
        // Roll back the optimistic toggle.
        setPrefs((p) => ({
          ...p,
          [eventType]: { ...next, [channel]: !value },
        }));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Event</th>
              <th className="px-3 py-2 text-center font-medium">In-app</th>
              <th className="px-3 py-2 text-center font-medium">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
            {EVENT_TYPES.map((e) => {
              const pref = prefs[e.key]!;
              return (
                <tr key={e.key}>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{e.label}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={pref.inApp}
                      disabled={pending}
                      onChange={(ev) => toggle(e.key, "inApp", ev.target.checked)}
                      aria-label={`${e.label} — in-app`}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={pref.email}
                      disabled={pending}
                      onChange={(ev) => toggle(e.key, "email", ev.target.checked)}
                      aria-label={`${e.label} — email`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Changes save automatically.
      </p>
    </div>
  );
}
