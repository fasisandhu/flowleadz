import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { adminListWorkRequestsAction } from "@/lib/server-actions/admin/work-requests";
import { adminListProjectsAction } from "@/lib/server-actions/admin/projects";
import { adminListRecentActivityAction } from "@/lib/server-actions/admin/tasks";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  const [submittedR, projectsR, activityR] = await Promise.all([
    adminListWorkRequestsAction(orgId, { status: "submitted" }),
    adminListProjectsAction(orgId, { status: "active" }),
    adminListRecentActivityAction(orgId, 20),
  ]);

  const pending = submittedR.ok ? submittedR.data.length : 0;
  const activeProjects = projectsR.ok ? projectsR.data.length : 0;
  const activity = activityR.ok ? activityR.data : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Pending work requests</CardDescription>
            <CardTitle className="text-3xl">{pending}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/admin/orgs/${orgId}/work-requests?status=submitted`}
              className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Review queue →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active projects</CardDescription>
            <CardTitle className="text-3xl">{activeProjects}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/admin/orgs/${orgId}/projects`}
              className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
            >
              View all →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>New project</CardDescription>
            <CardTitle className="text-base font-normal">Create one</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/admin/orgs/${orgId}/projects/new`}
              className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
            >
              + New project →
            </Link>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent activity</h2>
        <ActivityFeed
          events={activity}
          taskHrefFor={(taskId) => `/admin/orgs/${orgId}/tasks/${taskId}`}
        />
      </section>
    </div>
  );
}
