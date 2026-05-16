"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { adminInviteUserAction } from "@/lib/server-actions/admin/users";

const ROLES = ["customer", "employee", "admin"] as const;
const ROLE_LABELS: Record<string, string> = {
  customer: "Customer (member of this org)",
  employee: "Employee (agency staff)",
  admin: "Admin (agency staff)",
};

export function InviteUserForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [systemRole, setSystemRole] = useState<(typeof ROLES)[number]>("customer");
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setEmail("");
    setSystemRole("customer");
    setAcceptUrl(null);
    setError(null);
    setCopied(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAcceptUrl(null);
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    startTransition(async () => {
      // Customer invitations are scoped to the org; staff invitations are not.
      const r = await adminInviteUserAction(orgId, {
        email: email.trim(),
        systemRole,
        orgId: systemRole === "customer" ? orgId : undefined,
      });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setAcceptUrl(r.data.acceptUrl);
      router.refresh();
    });
  }

  async function copyAcceptUrl() {
    if (!acceptUrl) return;
    try {
      await navigator.clipboard.writeText(acceptUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied */
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="mr-1 h-3.5 w-3.5" />
        Invite user
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
      {acceptUrl && (
        <Alert>
          <AlertDescription className="space-y-2">
            <p className="text-sm">Invitation created. Send this link to the user:</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800">
                {acceptUrl}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={copyAcceptUrl}>
                {copied ? (
                  <>
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="alice@example.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-role">Role</Label>
        <Select
          value={systemRole}
          onValueChange={(v) => v && setSystemRole(v as (typeof ROLES)[number])}
        >
          <SelectTrigger id="invite-role">
            <SelectValue>
              {(v) => (typeof v === "string" ? (ROLE_LABELS[v] ?? v) : null)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={pending}
        >
          Close
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Inviting…" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}
