import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { listProjectsAction } from "@/lib/server-actions/projects";
import { listDailyUpdatesAction } from "@/lib/server-actions/daily-updates";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { DailyUpdateCard } from "@/components/app/daily-update-card";
import { TaskListItem } from "@/components/app/task-list-item";

export default async function CustomerDashboardPage() {
  const [projectsR, updatesR, tasksR] = await Promise.all([
    listProjectsAction({ status: "active" }),
    listDailyUpdatesAction({}),
    listTasksAction({}),
  ]);

  const activeProjects = projectsR.ok ? projectsR.data.slice(0, 3) : [];
  const recentUpdates = updatesR.ok ? updatesR.data.slice(0, 5) : [];
  const upcomingTasks = tasksR.ok
    ? tasksR.data
        .filter((t) => ["todo", "in_progress", "blocked"].includes(t.status))
        .slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link href="/customer/requests/new" className={cn(buttonVariants())}>
          <Plus className="mr-2 h-4 w-4" />
          New work request
        </Link>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Active projects</h2>
          <Link href="/customer/projects" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        {activeProjects.length === 0 ? (
          <p className="text-sm text-slate-500">No active projects yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {activeProjects.map((p) => (
              <Card key={p.id}>
                <CardHeader>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  <div className="mb-1 capitalize">{p.serviceType.replace("_", " ")}</div>
                  <Link
                    href={`/customer/projects/${p.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Open project →
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent updates</h2>
        </div>
        {recentUpdates.length === 0 ? (
          <p className="text-sm text-slate-500">No updates yet.</p>
        ) : (
          <div className="space-y-3">
            {recentUpdates.map((u) => (
              <DailyUpdateCard key={u.id} update={u} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Upcoming tasks</h2>
        {upcomingTasks.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing on deck.</p>
        ) : (
          <div className="space-y-2">
            {upcomingTasks.map((t) => (
              <TaskListItem key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
