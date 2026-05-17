import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, Briefcase } from "lucide-react";

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

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  completed: "bg-slate-400",
  archived: "bg-slate-300 dark:bg-slate-600",
  draft: "bg-slate-300 dark:bg-slate-600",
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  serviceType: string;
  status: string;
  startDate?: string | Date | null;
};

export function ProjectListItem({
  project,
  href,
}: {
  project: Project;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3 transition first:rounded-t-lg last:rounded-b-lg last:border-b-0 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/40"
    >
      <span
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[project.status] ?? "bg-slate-400"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
            {project.name}
          </span>
          <span className="text-[11px] uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
            {STATUS_LABELS[project.status] ?? project.status}
          </span>
        </div>
        {project.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
            {project.description}
          </p>
        )}
      </div>
      <span className="hidden items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 sm:flex">
        <Briefcase className="h-3 w-3" aria-hidden="true" />
        {SERVICE_TYPE_LABELS[project.serviceType] ?? project.serviceType}
      </span>
      {project.startDate && (
        <span className="hidden text-xs text-slate-400 dark:text-slate-500 md:inline">
          {format(new Date(project.startDate), "MMM d, yyyy")}
        </span>
      )}
      <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
    </Link>
  );
}

export function ProjectList({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      {children}
    </div>
  );
}
