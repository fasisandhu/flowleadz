"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { adminUpdateProjectAction } from "@/lib/server-actions/admin/projects";

const SERVICE_TYPES = ["seo", "paid_ads", "social", "content", "web", "other"] as const;
const SERVICE_TYPE_LABELS: Record<string, string> = {
  seo: "SEO",
  paid_ads: "Paid Ads",
  social: "Social",
  content: "Content",
  web: "Web",
  other: "Other",
};

const STATUSES = ["draft", "active", "paused", "completed", "archived"] as const;
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

function toDateInputValue(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function ProjectEditForm({
  orgId,
  project,
}: {
  orgId: string;
  project: {
    id: string;
    name: string;
    description: string | null;
    serviceType: string;
    status: string;
    startDate: string | Date | null;
    endDate: string | Date | null;
    hourlyRateCents: number | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [serviceType, setServiceType] = useState<(typeof SERVICE_TYPES)[number]>(
    (SERVICE_TYPES as readonly string[]).includes(project.serviceType)
      ? (project.serviceType as (typeof SERVICE_TYPES)[number])
      : "other",
  );
  const [status, setStatus] = useState<(typeof STATUSES)[number]>(
    (STATUSES as readonly string[]).includes(project.status)
      ? (project.status as (typeof STATUSES)[number])
      : "active",
  );
  const [startDate, setStartDate] = useState(toDateInputValue(project.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(project.endDate));
  const [hourlyRate, setHourlyRate] = useState(
    project.hourlyRateCents == null ? "" : (project.hourlyRateCents / 100).toFixed(2),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const rateCents =
      hourlyRate.trim() === "" ? null : Math.round(Number.parseFloat(hourlyRate) * 100);
    if (rateCents !== null && (Number.isNaN(rateCents) || rateCents <= 0)) {
      setError("Hourly rate must be a positive number.");
      return;
    }
    startTransition(async () => {
      const r = await adminUpdateProjectAction(orgId, {
        id: project.id,
        name: name.trim(),
        description: description.trim() || null,
        serviceType,
        status,
        startDate: startDate || null,
        endDate: endDate || null,
        hourlyRateCents: rateCents,
      });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Pencil className="mr-1 h-3.5 w-3.5" />
        Edit project
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="edit-project-name">Name</Label>
        <Input
          id="edit-project-name"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-project-description">Description</Label>
        <Textarea
          id="edit-project-description"
          rows={4}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-project-service">Service type</Label>
          <Select
            value={serviceType}
            onValueChange={(v) => v && setServiceType(v as (typeof SERVICE_TYPES)[number])}
          >
            <SelectTrigger id="edit-project-service">
              <SelectValue>
                {(v) => (typeof v === "string" ? (SERVICE_TYPE_LABELS[v] ?? v) : null)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SERVICE_TYPE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-project-status">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => v && setStatus(v as (typeof STATUSES)[number])}
          >
            <SelectTrigger id="edit-project-status">
              <SelectValue>
                {(v) => (typeof v === "string" ? (STATUS_LABELS[v] ?? v) : null)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="edit-project-start">Start date</Label>
          <Input
            id="edit-project-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-project-end">End date</Label>
          <Input
            id="edit-project-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-project-rate">Hourly rate (USD)</Label>
          <Input
            id="edit-project-rate"
            type="number"
            min="0"
            step="0.01"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="e.g. 150.00"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
