"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommentReplyForm } from "./comment-reply-form";

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
  orgId,
}: {
  update: Update;
  hrefBase?: string;
  /** Pass on admin routes so the comment action uses the right context. */
  orgId?: string;
}) {
  const href = `${hrefBase}/${update.projectId}/updates/${update.id}`;
  const logDateLabel = format(new Date(update.logDate), "MMM d, yyyy");
  const preview = update.body.length > 200 ? `${update.body.slice(0, 200)}…` : update.body;
  const [replyOpen, setReplyOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{ACTIVITY_LABELS[update.activityType] ?? update.activityType}</Badge>
          <CardDescription className="text-xs">{logDateLabel}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setReplyOpen((v) => !v)}
            aria-label="Comment on this update"
          >
            <MessageCircle className="mr-1 h-3.5 w-3.5" />
            Comment
          </Button>
          <Link href={href} className="text-sm text-blue-600 hover:underline dark:text-indigo-400">
            Open
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{preview}</p>
        {replyOpen && (
          <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
            <CommentReplyForm
              parentType="daily_update"
              parentId={update.id}
              orgId={orgId}
              onPosted={() => setReplyOpen(false)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
