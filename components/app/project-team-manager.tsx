"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { X } from "lucide-react";
import {
  adminAssignToProjectAction,
  adminUnassignFromProjectAction,
} from "@/lib/server-actions/admin/projects";

type StaffOption = { id: string; name: string };
type Assignment = { userId: string; name: string };

export function ProjectTeamManager({
  orgId,
  projectId,
  initialAssignments,
  staffOptions,
}: {
  orgId: string;
  projectId: string;
  initialAssignments: Assignment[];
  staffOptions: StaffOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickerValue, setPickerValue] = useState<string>("");

  const assignedIds = new Set(initialAssignments.map((a) => a.userId));
  const availableOptions = staffOptions.filter((o) => !assignedIds.has(o.id));

  function onAssign(userId: string) {
    setError(null);
    startTransition(async () => {
      const r = await adminAssignToProjectAction(orgId, { projectId, userId });
      if (!r.ok) setError(r.error.message);
      setPickerValue("");
      router.refresh();
    });
  }

  function onUnassign(userId: string) {
    setError(null);
    startTransition(async () => {
      const r = await adminUnassignFromProjectAction(orgId, { projectId, userId });
      if (!r.ok) setError(r.error.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {initialAssignments.length === 0 ? (
        <p className="text-sm text-slate-500">No one assigned yet.</p>
      ) : (
        <ul className="space-y-1">
          {initialAssignments.map((a) => (
            <li
              key={a.userId}
              className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm"
            >
              <span>{a.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => onUnassign(a.userId)}
                aria-label={`Unassign ${a.name}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {availableOptions.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            value={pickerValue}
            onValueChange={(v) => v && onAssign(v)}
            disabled={pending}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Assign someone…" />
            </SelectTrigger>
            <SelectContent>
              {availableOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
