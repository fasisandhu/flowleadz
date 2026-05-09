"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { markNotificationsReadAction } from "@/lib/server-actions/notifications";

type Notification = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  relatedType: string | null;
  relatedId: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
};

const EVENT_LABELS: Record<string, string> = {
  "daily_update.posted": "New daily update",
  "comment.posted": "New comment",
  "work_request.submitted": "Work request submitted",
  "work_request.status_changed": "Work request status changed",
  "task.assigned": "Task assigned to you",
  "task.status_changed": "Task status changed",
};

function relatedHref(n: Notification): string | null {
  if (n.relatedType === "task" && n.relatedId) {
    return `/employee/tasks`;
  }
  if (n.relatedType === "daily_update" && n.relatedId) {
    const projectId = (n.payload as { projectId?: string }).projectId;
    if (projectId) return `/employee/projects/${projectId}/updates/${n.relatedId}`;
  }
  if (n.relatedType === "comment" && n.relatedId) {
    const projectId = (n.payload as { projectId?: string }).projectId;
    const dailyUpdateId = (n.payload as { dailyUpdateId?: string }).dailyUpdateId;
    if (projectId && dailyUpdateId) return `/employee/projects/${projectId}/updates/${dailyUpdateId}`;
  }
  return null;
}

export function EmployeeNotificationsList({ initial }: { initial: Notification[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items] = useState(initial);

  const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);

  function handleMarkAll() {
    if (unreadIds.length === 0) return;
    startTransition(async () => {
      await markNotificationsReadAction({ ids: unreadIds });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{unreadIds.length} unread</p>
        <Button variant="outline" size="sm" onClick={handleMarkAll} disabled={pending || unreadIds.length === 0}>
          {pending ? "Marking…" : "Mark all as read"}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No notifications.</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const href = relatedHref(n);
            const label = EVENT_LABELS[n.eventType] ?? n.eventType;
            const inner = (
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-medium">{label}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {format(new Date(n.createdAt), "MMM d, yyyy h:mm a")}
                  </div>
                </div>
                {!n.readAt && (
                  <span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-500" aria-label="Unread" />
                )}
              </CardContent>
            );
            return (
              <Card key={n.id} className={n.readAt ? "" : "border-blue-300"}>
                {href ? (
                  <Link href={href} className="block">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
