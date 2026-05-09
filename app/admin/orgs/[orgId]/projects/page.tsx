import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { adminListProjectsAction } from "@/lib/server-actions/admin/projects";

const SERVICE_TYPE_LABELS: Record<string, string> = {
  seo: "SEO",
  paid_ads: "Paid Ads",
  social: "Social",
  content: "Content",
  web: "Web",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
  draft: "Draft",
};

export default async function AdminProjectsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const r = await adminListProjectsAction(orgId, {});
  const projects = r.ok ? r.data : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link
          href={`/admin/orgs/${orgId}/projects/new`}
          className={cn(buttonVariants())}
        >
          <Plus className="mr-2 h-4 w-4" />
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-slate-500">No projects yet. Create one to get started.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    <Link
                      href={`/admin/orgs/${orgId}/projects/${p.id}`}
                      className="hover:underline"
                    >
                      {p.name}
                    </Link>
                  </CardTitle>
                  <Badge variant="secondary">{STATUS_LABELS[p.status] ?? p.status}</Badge>
                </div>
                <CardDescription>{SERVICE_TYPE_LABELS[p.serviceType] ?? p.serviceType}</CardDescription>
              </CardHeader>
              {p.description && (
                <CardContent className="text-sm text-slate-600 line-clamp-2">
                  {p.description}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
