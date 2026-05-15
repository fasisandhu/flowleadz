"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { adminMarkNotificationsReadAction } from "@/lib/server-actions/admin/notifications";

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
  "task.assigned": "Task assigned",
  "task.status_changed": "Task status changed",
};

function relatedHref(orgId: string, n: Notification): string | null {
  if (n.relatedType === "work_request" && n.relatedId) {
    return `/admin/orgs/${orgId}/work-requests/${n.relatedId}`;
  }
  if (n.relatedType === "task" && n.relatedId) {
    const projectId = (n.payload as { projectId?: string }).projectId;
    if (projectId) return `/admin/orgs/${orgId}/projects/${projectId}`;
  }
  if (n.relatedType === "daily_update" && n.relatedId) {
    const projectId = (n.payload as { projectId?: string }).projectId;
    if (projectId) return `/admin/orgs/${orgId}/projects/${projectId}`;
  }
  if (n.relatedType === "comment" && n.relatedId) {
    const projectId = (n.payload as { projectId?: string }).projectId;
    if (projectId) return `/admin/orgs/${orgId}/projects/${projectId}`;
  }
  return null;
}

export function AdminNotificationsList({
  orgId,
  initial,
}: {
  orgId: string;
  initial: Notification[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items] = useState(initial);

  const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);

  function handleMarkAll() {
    if (unreadIds.length === 0) return;
    startTransition(async () => {
      await adminMarkNotificationsReadAction(orgId, { ids: unreadIds });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">{unreadIds.length} unread</p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAll}
          disabled={pending || unreadIds.length === 0}
        >
          {pending ? "Marking…" : "Mark all as read"}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No notifications.</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const href = relatedHref(orgId, n);
            const label = EVENT_LABELS[n.eventType] ?? n.eventType;
            const inner = (
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-medium">{label}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {format(new Date(n.createdAt), "MMM d, yyyy h:mm a")}
                  </div>
                </div>
                {!n.readAt && (
                  <span
                    className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-500"
                    aria-label="Unread"
                  />
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
