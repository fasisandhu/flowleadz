"use client";

import { useMemo, useState } from "react";
import { ActivityDayDivider, ActivityFeedEvent } from "./activity-feed-event";
import type { ActivityEvent } from "@/lib/services/tasks";

function dateKey(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

type CommentEvent = Extract<ActivityEvent, { kind: "comment" }>;

type FilterKey = "all" | "update" | "comment" | "status_change" | "time_log" | "attachment";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "update", label: "Updates" },
  { key: "comment", label: "Comments" },
  { key: "status_change", label: "Status" },
  { key: "time_log", label: "Time" },
  { key: "attachment", label: "Files" },
];

export function ActivityFeed({
  events,
  taskHrefBase,
  orgId,
}: {
  events: ActivityEvent[];
  /** URL prefix the client appends taskId to. Functions can't cross the server→client boundary. */
  taskHrefBase?: string;
  /** Pass on admin routes so inline reply on update cards uses the right context. */
  orgId?: string;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  // Group comments by their parent update so they render nested under the
  // update card. Always do this for "all" view; for filtered views show
  // bare events without nesting (the comment filter shows comments inline).
  const { groups, commentsByUpdate } = useMemo(() => {
    const filtered =
      filter === "all"
        ? events
        : events.filter((e) => e.kind === filter);

    const commentsByUpdate = new Map<string, CommentEvent[]>();
    const remaining: ActivityEvent[] = [];
    if (filter === "all") {
      for (const e of filtered) {
        if (e.kind === "comment" && e.parentUpdateId) {
          const arr = commentsByUpdate.get(e.parentUpdateId) ?? [];
          arr.push(e);
          commentsByUpdate.set(e.parentUpdateId, arr);
        } else {
          remaining.push(e);
        }
      }
      for (const arr of commentsByUpdate.values()) {
        arr.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      }
    } else {
      remaining.push(...filtered);
    }

    const groups: { date: string; events: ActivityEvent[] }[] = [];
    for (const e of remaining) {
      const k = dateKey(e.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.date === k) last.events.push(e);
      else groups.push({ date: k, events: [e] });
    }
    return { groups, commentsByUpdate };
  }, [events, filter]);

  const empty = groups.length === 0;
  const hasEvents = events.length > 0;

  return (
    <div className="space-y-3">
      {hasEvents && (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-1 dark:border-slate-800">
          {FILTERS.map((f) => {
            const n = f.key === "all" ? events.length : (counts[f.key] ?? 0);
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition " +
                  (active
                    ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200")
                }
              >
                {f.label}
                <span
                  className={
                    "tabular-nums " +
                    (active ? "text-slate-500 dark:text-slate-400" : "text-slate-400 dark:text-slate-500")
                  }
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {empty ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          {hasEvents ? "Nothing matches this filter." : "No activity yet."}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.date} className="space-y-3">
              <ActivityDayDivider date={g.date} />
              {g.events.map((e) => (
                <ActivityFeedEvent
                  key={`${e.kind}-${e.id}`}
                  event={e}
                  taskHref={taskHrefBase ? `${taskHrefBase}/${e.taskId}` : undefined}
                  orgId={orgId}
                  comments={
                    e.kind === "update" ? (commentsByUpdate.get(e.id) ?? []) : undefined
                  }
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
