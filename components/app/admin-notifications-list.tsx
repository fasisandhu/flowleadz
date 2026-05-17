"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminMarkNotificationsReadAction } from "@/lib/server-actions/admin/notifications";
import {
  NotificationRow,
  NotificationListShell,
  NotificationEmptyState,
  type NotificationShape,
} from "./notification-row";

function relatedHref(orgId: string, n: NotificationShape): string | null {
  const p = n.payload;
  if (n.relatedType === "work_request" && n.relatedId) {
    return `/admin/orgs/${orgId}/work-requests/${n.relatedId}`;
  }
  if (n.relatedType === "task" && n.relatedId) {
    return `/admin/orgs/${orgId}/tasks/${n.relatedId}`;
  }
  if (n.relatedType === "daily_update" && n.relatedId) {
    const projectId = typeof p.projectId === "string" ? p.projectId : null;
    if (projectId) return `/admin/orgs/${orgId}/projects/${projectId}`;
  }
  if (n.relatedType === "comment" && n.relatedId) {
    if (p.parentType === "task" && typeof p.parentId === "string") {
      return `/admin/orgs/${orgId}/tasks/${p.parentId}`;
    }
    const projectId = typeof p.projectId === "string" ? p.projectId : null;
    if (projectId) return `/admin/orgs/${orgId}/projects/${projectId}`;
  }
  return null;
}

export function AdminNotificationsList({
  orgId,
  initial,
}: {
  orgId: string;
  initial: NotificationShape[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Read from prop so router.refresh() (after Mark all read) reflects.
  const items = initial;

  const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);

  function handleMarkAll() {
    if (unreadIds.length === 0) return;
    startTransition(async () => {
      await adminMarkNotificationsReadAction(orgId, { ids: unreadIds });
      router.refresh();
    });
  }

  if (items.length === 0) return <NotificationEmptyState />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAll}
          disabled={pending || unreadIds.length === 0}
        >
          {pending ? "Marking…" : "Mark all as read"}
        </Button>
      </div>
      <NotificationListShell>
        {items.map((n) => (
          <NotificationRow key={n.id} n={n} href={relatedHref(orgId, n)} />
        ))}
      </NotificationListShell>
    </div>
  );
}
