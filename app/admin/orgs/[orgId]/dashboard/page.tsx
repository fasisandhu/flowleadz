import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { adminListWorkRequestsAction } from "@/lib/server-actions/admin/work-requests";
import { adminListProjectsAction } from "@/lib/server-actions/admin/projects";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  submitted: "default",
  accepted: "secondary",
  rejected: "destructive",
  duplicate: "outline",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  accepted: "Accepted",
  rejected: "Rejected",
  duplicate: "Duplicate",
};

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  const [submittedR, projectsR, recentR] = await Promise.all([
    adminListWorkRequestsAction(orgId, { status: "submitted" }),
    adminListProjectsAction(orgId, { status: "active" }),
    adminListWorkRequestsAction(orgId, {}),
  ]);

  const pending = submittedR.ok ? submittedR.data.length : 0;
  const activeProjects = projectsR.ok ? projectsR.data.length : 0;
  const recent = recentR.ok ? recentR.data.slice(0, 5) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Pending work requests</CardDescription>
            <CardTitle className="text-3xl">{pending}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/admin/orgs/${orgId}/work-requests?status=submitted`}
              className="text-sm text-blue-600 hover:underline"
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
              className="text-sm text-blue-600 hover:underline"
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
              className="text-sm text-blue-600 hover:underline"
            >
              + New project →
            </Link>
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-medium">Recent work requests</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">None yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/orgs/${orgId}/work-requests/${r.id}`}
                      className="font-medium hover:underline"
                    >
                      {r.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {format(new Date(r.createdAt), "MMM d, yyyy h:mm a")}
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} className="text-xs">
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
