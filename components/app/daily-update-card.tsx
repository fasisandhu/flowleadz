import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Update = {
  id: string;
  projectId: string;
  body: string;
  activityType: string;
  visibility: string;
  logDate: string;
  createdAt: Date | string;
};

const ACTIVITY_LABELS: Record<string, string> = {
  planning: "Planning",
  execution: "Execution",
  review: "Review",
  meeting: "Meeting",
  admin: "Admin",
  other: "Other",
};

export function DailyUpdateCard({
  update,
  hrefBase = "/customer/projects",
}: {
  update: Update;
  hrefBase?: string;
}) {
  const href = `${hrefBase}/${update.projectId}/updates/${update.id}`;
  const logDateLabel = format(new Date(update.logDate), "MMM d, yyyy");
  const preview = update.body.length > 200 ? `${update.body.slice(0, 200)}…` : update.body;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{ACTIVITY_LABELS[update.activityType] ?? update.activityType}</Badge>
          <CardDescription className="text-xs">{logDateLabel}</CardDescription>
        </div>
        <Link href={href} className="text-sm text-blue-600 hover:underline dark:text-indigo-400">
          Open
        </Link>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{preview}</p>
      </CardContent>
    </Card>
  );
}
