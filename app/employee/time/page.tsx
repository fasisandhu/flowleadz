import { listTimeEntriesAction } from "@/lib/server-actions/time-entries";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { TimeEntryRow } from "@/components/app/time-entry-row";

export default async function EmployeeTimePage() {
  const [entriesR, tasksR] = await Promise.all([
    listTimeEntriesAction({}),
    listTasksAction({}),
  ]);
  const entries = entriesR.ok ? entriesR.data : [];
  const taskMap = new Map<string, { title: string }>();
  if (tasksR.ok) {
    for (const t of tasksR.data) taskMap.set(t.id, { title: t.title });
  }

  // Sort newest-first by loggedForDate then createdAt.
  entries.sort((a, b) => {
    if (a.loggedForDate !== b.loggedForDate) return a.loggedForDate < b.loggedForDate ? 1 : -1;
    return new Date(a.createdAt as Date | string).getTime() < new Date(b.createdAt as Date | string).getTime() ? 1 : -1;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My time</h1>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No time logged yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <TimeEntryRow key={e.id} entry={e} task={taskMap.get(e.taskId)} />
          ))}
        </div>
      )}
    </div>
  );
}
