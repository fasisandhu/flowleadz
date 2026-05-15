import { ActivityDayDivider, ActivityFeedEvent } from "./activity-feed-event";
import type { ActivityEvent } from "@/lib/services/tasks";

function dateKey(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function ActivityFeed({
  events,
  taskHrefFor,
}: {
  events: ActivityEvent[];
  taskHrefFor?: (taskId: string) => string;
}) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No activity yet.
      </p>
    );
  }

  const groups: { date: string; events: ActivityEvent[] }[] = [];
  for (const e of events) {
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
            />
          ))}
        </section>
      ))}
    </div>
  );
}
