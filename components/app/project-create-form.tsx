"use client";

import { useState } from "react";
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
import { adminCreateProjectAction } from "@/lib/server-actions/admin/projects";

const SERVICE_TYPES = ["seo", "paid_ads", "social", "content", "web", "other"] as const;

const SERVICE_TYPE_LABELS: Record<string, string> = {
  seo: "SEO",
  paid_ads: "Paid Ads",
  social: "Social",
  content: "Content",
  web: "Web",
  other: "Other",
};

export function ProjectCreateForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serviceType, setServiceType] = useState<typeof SERVICE_TYPES[number]>("seo");
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);

    const rateCents =
      hourlyRate.trim() === ""
        ? undefined
        : Math.round(Number.parseFloat(hourlyRate) * 100);
    if (hourlyRate.trim() !== "" && (Number.isNaN(rateCents) || rateCents! <= 0)) {
      setFieldErrors({ hourlyRateCents: "Must be a positive number" });
      setPending(false);
      return;
    }

    const r = await adminCreateProjectAction(orgId, {
      name,
      description: description || undefined,
      serviceType,
      hourlyRateCents: rateCents,
    });
    setPending(false);
    if (!r.ok) {
      if (r.error.code === "validation" && r.error.fields) {
        setFieldErrors(r.error.fields);
      }
      setError(r.error.message);
      return;
    }
    router.push(`/admin/orgs/${orgId}/projects/${r.data.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {fieldErrors.name && <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.name}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          rows={4}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="serviceType">Service type</Label>
          <Select
            value={serviceType}
            onValueChange={(v) => v && setServiceType(v as typeof SERVICE_TYPES[number])}
          >
            <SelectTrigger id="serviceType">
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
          {fieldErrors.serviceType && <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.serviceType}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="hourlyRate">Hourly rate (USD, optional)</Label>
          <Input
            id="hourlyRate"
            type="number"
            min="0"
            step="0.01"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="e.g. 150.00"
          />
          {fieldErrors.hourlyRateCents && <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.hourlyRateCents}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
