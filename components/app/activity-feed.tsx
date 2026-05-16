import { ActivityDayDivider, ActivityFeedEvent } from "./activity-feed-event";
import type { ActivityEvent } from "@/lib/services/tasks";

function dateKey(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

type CommentEvent = Extract<ActivityEvent, { kind: "comment" }>;

export function ActivityFeed({
  events,
  taskHrefFor,
  orgId,
}: {
  events: ActivityEvent[];
  taskHrefFor?: (taskId: string) => string;
  /** Pass on admin routes so inline reply on update cards uses the right context. */
  orgId?: string;
}) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
        No activity yet.
      </p>
    );
  }

  // Group comments by their parent update so they render nested under the
  // update card instead of floating chronologically at the bottom of the feed.
  const commentsByUpdate = new Map<string, CommentEvent[]>();
  const remaining: ActivityEvent[] = [];
  for (const e of events) {
    if (e.kind === "comment" && e.parentUpdateId) {
      const arr = commentsByUpdate.get(e.parentUpdateId) ?? [];
      arr.push(e);
      commentsByUpdate.set(e.parentUpdateId, arr);
    } else {
      remaining.push(e);
    }
  }
  // Comments inside a card should be oldest-first (a regular reply thread).
  for (const arr of commentsByUpdate.values()) {
    arr.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  const groups: { date: string; events: ActivityEvent[] }[] = [];
  for (const e of remaining) {
    const k = dateKey(e.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.date === k) last.events.push(e);
    else groups.push({ date: k, events: [e] });
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.date} className="space-y-3">
          <ActivityDayDivider date={g.date} />
          {g.events.map((e) => (
            <ActivityFeedEvent
              key={`${e.kind}-${e.id}`}
              event={e}
              taskHref={taskHrefFor?.(e.taskId)}
              orgId={orgId}
              comments={
                e.kind === "update" ? (commentsByUpdate.get(e.id) ?? []) : undefined
              }
            />
          ))}
        </section>
      ))}
    </div>
  );
}
