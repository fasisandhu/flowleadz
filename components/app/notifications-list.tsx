"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { markNotificationsReadAction } from "@/lib/server-actions/notifications";
import {
  NotificationRow,
  NotificationListShell,
  NotificationEmptyState,
  type NotificationShape,
} from "./notification-row";

function relatedHref(n: NotificationShape): string | null {
  const p = n.payload;
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

export function NotificationsList({ initial }: { initial: NotificationShape[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Read directly from props so router.refresh() (after Mark all read) reflects
  // immediately. useState(initial) snapshots once and ignores prop updates.
  const items = initial;

  const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);

  function handleMarkAll() {
    if (unreadIds.length === 0) return;
    startTransition(async () => {
      await markNotificationsReadAction({ ids: unreadIds });
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
          <NotificationRow key={n.id} n={n} href={relatedHref(n)} />
        ))}
      </NotificationListShell>
    </div>
  );
}
