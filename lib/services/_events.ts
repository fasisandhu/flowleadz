export type DomainEvent =
  | { type: "daily_update.posted"; orgId: string; actorId: string; dailyUpdateId: string; visibility: "customer_visible" | "internal_only" }
  | { type: "comment.posted"; orgId: string; actorId: string; commentId: string; parentType: string; parentId: string; projectId?: string }
  | { type: "work_request.submitted"; orgId: string; actorId: string; workRequestId: string }
  | { type: "work_request.status_changed"; orgId: string; actorId: string; workRequestId: string; from: string | null; to: string }
  | { type: "task.assigned"; orgId: string; actorId: string; taskId: string; newAssigneeIds: string[] }
  | { type: "task.status_changed"; orgId: string; actorId: string; taskId: string; from: string | null; to: string };

export type EventType = DomainEvent["type"];
