// Centralized task + work-request status types, labels, and pre-rendered
// pill class strings. Pre-rendered (not template-built) so Tailwind's
// content scanner picks every class up.

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type WorkRequestStatus = "submitted" | "accepted" | "rejected" | "duplicate";

export const TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;

export const WORK_REQUEST_STATUSES: readonly WorkRequestStatus[] = [
  "submitted",
  "accepted",
  "rejected",
  "duplicate",
] as const;

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const WORK_REQUEST_STATUS_LABELS: Record<WorkRequestStatus, string> = {
  submitted: "Submitted",
  accepted: "Accepted",
  rejected: "Rejected",
  duplicate: "Duplicate",
};

// Pre-rendered Tailwind class strings keyed by status.
// The dot indicator is a small bg-* circle; the pill wrapper is the rest.

export const TASK_STATUS_PILL_CLASSES: Record<TaskStatus, string> = {
  todo: "bg-slate-50 text-slate-700 border-slate-200",
  in_progress: "bg-indigo-50 text-indigo-700 border-indigo-200",
  blocked: "bg-amber-50 text-amber-700 border-amber-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

export const TASK_STATUS_DOT_CLASSES: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-indigo-500",
  blocked: "bg-amber-500",
  done: "bg-emerald-500",
  cancelled: "bg-slate-300",
};

export const WORK_REQUEST_STATUS_PILL_CLASSES: Record<WorkRequestStatus, string> = {
  submitted: "bg-indigo-50 text-indigo-700 border-indigo-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  duplicate: "bg-slate-50 text-slate-500 border-slate-200",
};
