import Link from "next/link";
import { Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/button";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { listDailyUpdatesAction } from "@/lib/server-actions/daily-updates";
import { listProjectsAction } from "@/lib/server-actions/projects";
import { TaskListItem } from "@/components/app/task-list-item";
import { DailyUpdateCard } from "@/components/app/daily-update-card";

export default async function EmployeeDashboardPage() {
  const [tasksR, updatesR, projectsR] = await Promise.all([
    listTasksAction({}),
    listDailyUpdatesAction({}),
    listProjectsAction({ status: "active" }),
  ]);

  const openTasks = tasksR.ok
    ? tasksR.data
        .filter((t) => ["todo", "in_progress", "blocked"].includes(t.status))
        .slice(0, 5)
    : [];
  const recentUpdates = updatesR.ok ? updatesR.data.slice(0, 5) : [];
  const activeProjects = projectsR.ok ? projectsR.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          {activeProjects.length > 0 && (
            <Link
              href={`/employee/projects/${activeProjects[0]!.id}/updates/new`}
              className={cn(buttonVariants())}
            >
              <Plus className="mr-2 h-4 w-4" />
              Post update
            </Link>
          )}
          {activeProjects.length > 0 && (
            <Link
              href={`/employee/projects/${activeProjects[0]!.id}/time/new`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <Clock className="mr-2 h-4 w-4" />
              Log time
            </Link>
          )}
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Open tasks</h2>
          <Link href="/employee/tasks" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        {openTasks.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing on deck.</p>
        ) : (
          <div className="space-y-2">
            {openTasks.map((t) => (
              <TaskListItem key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Recent updates</h2>
        {recentUpdates.length === 0 ? (
          <p className="text-sm text-slate-500">No updates yet.</p>
        ) : (
          <div className="space-y-3">
            {recentUpdates.map((u) => (
              <DailyUpdateCard
                key={u.id}
                update={u}
                hrefBase="/employee/projects"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
