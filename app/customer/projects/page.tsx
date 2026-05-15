import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listProjectsAction } from "@/lib/server-actions/projects";
import { EmptyState } from "@/components/app/empty-state";
import { EmptyProjectsIllustration } from "@/components/app/illustrations/empty-projects";

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

export default async function CustomerProjectsPage() {
  const r = await listProjectsAction({});
  const projects = r.ok ? r.data : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Projects</h1>

      {projects.length === 0 ? (
        <EmptyState
          illustration={EmptyProjectsIllustration}
          title="No projects yet"
          description="You'll see projects here once they're set up."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    <Link
                      href={`/customer/projects/${p.id}`}
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
                <CardContent className="text-sm text-slate-600 line-clamp-2 dark:text-slate-300">
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
