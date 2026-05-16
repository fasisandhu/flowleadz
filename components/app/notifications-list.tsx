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
  actor: { id: string; name: string | null; email: string } | null;
};

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

function describe(n: Notification): string {
  const actor = n.actor?.name ?? n.actor?.email ?? "Someone";
  const p = n.payload as Record<string, unknown>;
  const title = typeof p.title === "string" ? p.title : null;
  switch (n.eventType) {
    case "task.assigned":
      return `${actor} assigned you${title ? ` to ${title}` : " to a task"}`;
    case "task.status_changed": {
      const from = typeof p.from === "string" ? (STATUS_LABELS[p.from] ?? p.from) : null;
      const to = typeof p.to === "string" ? (STATUS_LABELS[p.to] ?? p.to) : null;
      const suffix = from && to ? ` from ${from} to ${to}` : "";
      return `${actor} changed status${title ? ` of ${title}` : ""}${suffix}`;
    }
    case "daily_update.posted":
      return `${actor} posted a daily update`;
    case "comment.posted":
      return `${actor} commented`;
    case "work_request.submitted":
      return `${actor} submitted${title ? ` "${title}"` : " a work request"}`;
    case "work_request.status_changed":
      return `${actor} updated${title ? ` "${title}"` : " a work request"}`;
    default:
      return n.eventType;
  }
}

function relatedHref(n: Notification): string | null {
  const p = n.payload as Record<string, unknown>;
  if (n.relatedType === "work_request" && n.relatedId) {
    return `/customer/requests/${n.relatedId}`;
  }
  if (n.relatedType === "task" && n.relatedId) {
    return `/customer/tasks/${n.relatedId}`;
  }
  if (n.relatedType === "daily_update" && n.relatedId) {
    const projectId = typeof p.projectId === "string" ? p.projectId : null;
    if (projectId) return `/customer/projects/${projectId}/updates/${n.relatedId}`;
  }
  if (n.relatedType === "comment" && n.relatedId) {
    if (p.parentType === "task" && typeof p.parentId === "string") {
      return `/customer/tasks/${p.parentId}`;
    }
  }
  return null;
}

export function NotificationsList({ initial }: { initial: Notification[] }) {
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
        <p className="text-sm text-slate-500 dark:text-slate-400">{unreadIds.length} unread</p>
        <Button variant="outline" size="sm" onClick={handleMarkAll} disabled={pending || unreadIds.length === 0}>
          {pending ? "Marking…" : "Mark all as read"}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No notifications.</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const href = relatedHref(n);
            const inner = (
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="text-sm">{describe(n)}</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {format(new Date(n.createdAt), "MMM d, yyyy h:mm a")}
                  </div>
                </div>
                {!n.readAt && (
                  <span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-500" aria-label="Unread" />
                )}
              </CardContent>
            );
            return (
              <Card key={n.id} className={n.readAt ? "" : "border-indigo-300 dark:border-indigo-700"}>
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
