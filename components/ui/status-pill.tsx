import { cn } from "@/lib/utils/cn";
import {
  TASK_STATUS_DOT_CLASSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_PILL_CLASSES,
  WORK_REQUEST_STATUS_LABELS,
  WORK_REQUEST_STATUS_PILL_CLASSES,
  type TaskStatus,
  type WorkRequestStatus,
} from "@/lib/constants/status";

export function TaskStatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        TASK_STATUS_PILL_CLASSES[status],
        className,
      )}
    >
      <span
        className={cn("inline-block h-1.5 w-1.5 rounded-full", TASK_STATUS_DOT_CLASSES[status])}
        aria-hidden="true"
      />
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

export function WorkRequestStatusPill({
  status,
  className,
}: {
  status: WorkRequestStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        WORK_REQUEST_STATUS_PILL_CLASSES[status],
        className,
      )}
    >
      {WORK_REQUEST_STATUS_LABELS[status]}
    </span>
  );
}
