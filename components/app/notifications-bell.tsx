"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { listNotificationsAction } from "@/lib/server-actions/notifications";

const POLL_INTERVAL_MS = 30_000;

export function NotificationsBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [unread, setUnread] = useState(initialUnreadCount);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await listNotificationsAction({ filter: "unread", limit: 1 });
      if (!cancelled && r.ok) setUnread(r.data.unreadCount);
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <Link
      href="/customer/notifications"
      aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      className="relative inline-flex items-center justify-center rounded-md p-2 hover:bg-slate-100"
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unread > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs"
        >
          {unread > 99 ? "99+" : unread}
        </Badge>
      )}
    </Link>
  );
}
