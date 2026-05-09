"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  adminAcceptWorkRequestAction,
  adminRejectWorkRequestAction,
  adminMarkDuplicateWorkRequestAction,
} from "@/lib/server-actions/admin/work-requests";

type ProjectOption = { id: string; name: string };

export function WorkRequestReviewBar({
  orgId,
  requestId,
  initialStatus,
  projects,
}: {
  orgId: string;
  requestId: string;
  initialStatus: string;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [acceptProjectId, setAcceptProjectId] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [duplicateTaskId, setDuplicateTaskId] = useState<string>("");

  const disabled = initialStatus !== "submitted" || pending;

  function onAccept() {
    setError(null);
    startTransition(async () => {
      const r = await adminAcceptWorkRequestAction(orgId, {
        id: requestId,
        projectId: acceptProjectId || undefined,
      });
      if (!r.ok) setError(r.error.message);
      router.refresh();
    });
  }

  function onReject() {
    setError(null);
    if (!rejectReason.trim()) {
      setError("A reason is required to reject.");
      return;
    }
    startTransition(async () => {
      const r = await adminRejectWorkRequestAction(orgId, {
        id: requestId,
        reason: rejectReason,
      });
      if (!r.ok) setError(r.error.message);
      router.refresh();
    });
  }

  function onMarkDuplicate() {
    setError(null);
    if (!duplicateTaskId.trim()) {
      setError("A canonical task id is required to mark duplicate.");
      return;
    }
    startTransition(async () => {
      const r = await adminMarkDuplicateWorkRequestAction(orgId, {
        id: requestId,
        canonicalTaskId: duplicateTaskId,
      });
      if (!r.ok) setError(r.error.message);
      router.refresh();
    });
  }

  if (initialStatus !== "submitted") {
    return (
      <p className="text-sm text-slate-500">
        Already {initialStatus}. No further action available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-medium">Accept</h3>
          <div className="space-y-2">
            <Label htmlFor="acceptProject">Assign to project (optional)</Label>
            <Select
              value={acceptProjectId}
              onValueChange={(v) => v && setAcceptProjectId(v)}
            >
              <SelectTrigger id="acceptProject">
                <SelectValue placeholder="(leave unassigned)" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={onAccept} disabled={disabled}>
            {pending ? "Accepting…" : "Accept request"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-medium">Reject</h3>
          <div className="space-y-2">
            <Label htmlFor="rejectReason">Reason</Label>
            <Textarea
              id="rejectReason"
              rows={3}
              maxLength={2000}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <Button type="button" variant="destructive" onClick={onReject} disabled={disabled}>
            {pending ? "Rejecting…" : "Reject request"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-medium">Mark as duplicate</h3>
          <div className="space-y-2">
            <Label htmlFor="duplicateTaskId">Canonical task id</Label>
            <Input
              id="duplicateTaskId"
              value={duplicateTaskId}
              onChange={(e) => setDuplicateTaskId(e.target.value)}
              placeholder="task-id of the canonical request/task"
            />
          </div>
          <Button type="button" variant="outline" onClick={onMarkDuplicate} disabled={disabled}>
            {pending ? "Marking…" : "Mark duplicate"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
