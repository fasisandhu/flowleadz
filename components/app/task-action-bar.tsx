"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Clock, MessageCircle, MessageSquarePlus, Paperclip, RefreshCw } from "lucide-react";
import { PostUpdateForm } from "./post-update-form";
import { LogTimeInlineForm } from "./log-time-inline-form";
import { TaskStatusChanger } from "./task-status-changer";
import { AttachmentUpload } from "./attachment-upload";
import { CommentReplyForm } from "./comment-reply-form";
import type { TaskStatus } from "@/lib/constants/status";

type Mode = "none" | "post" | "log" | "status" | "attach" | "comment";

export function TaskActionBar({
  taskId,
  projectId,
  currentStatus,
  canPostUpdate,
  canLogTime,
  canChangeStatus,
  canAttach,
  canComment,
}: {
  taskId: string;
  projectId: string;
  currentStatus: TaskStatus;
  canPostUpdate: boolean;
  canLogTime: boolean;
  canChangeStatus: boolean;
  canAttach: boolean;
  canComment: boolean;
}) {
  const [mode, setMode] = useState<Mode>("none");
  const close = () => setMode("none");

  const showAny = canPostUpdate || canLogTime || canChangeStatus || canAttach || canComment;
  if (!showAny) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <div className="flex flex-wrap gap-2">
        {canPostUpdate && (
          <Button
            type="button"
            variant={mode === "post" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode(mode === "post" ? "none" : "post")}
          >
            <MessageSquarePlus className="mr-1 h-4 w-4" />
            Post update
          </Button>
        )}
        {canComment && (
          <Button
            type="button"
            variant={mode === "comment" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode(mode === "comment" ? "none" : "comment")}
          >
            <MessageCircle className="mr-1 h-4 w-4" />
            Comment
          </Button>
        )}
        {canLogTime && (
          <Button
            type="button"
            variant={mode === "log" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode(mode === "log" ? "none" : "log")}
          >
            <Clock className="mr-1 h-4 w-4" />
            Log time
          </Button>
        )}
        {canChangeStatus && (
          <Button
            type="button"
            variant={mode === "status" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode(mode === "status" ? "none" : "status")}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            Change status
          </Button>
        )}
        {canAttach && (
          <Button
            type="button"
            variant={mode === "attach" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode(mode === "attach" ? "none" : "attach")}
          >
            <Paperclip className="mr-1 h-4 w-4" />
            Attach
          </Button>
        )}
      </div>

      <div className={cn("mt-4", mode === "none" && "hidden")}>
        {mode === "post" && (
          <PostUpdateForm projectId={projectId} taskId={taskId} onPosted={close} />
        )}
        {mode === "log" && <LogTimeInlineForm taskId={taskId} onLogged={close} />}
        {mode === "status" && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 dark:text-slate-300">Current status:</span>
            <TaskStatusChanger taskId={taskId} currentStatus={currentStatus} />
          </div>
        )}
        {mode === "attach" && <AttachmentUpload parentType="task" parentId={taskId} />}
        {mode === "comment" && <CommentReplyForm parentType="task" parentId={taskId} />}
      </div>
    </div>
  );
}
