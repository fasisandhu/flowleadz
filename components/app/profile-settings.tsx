"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AvatarUpload } from "./avatar-upload";
import { updateProfileAction } from "@/lib/server-actions/users";

export function ProfileSettings({
  userId,
  name,
  email,
  image,
}: {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
}) {
  const router = useRouter();
  const [nameInput, setNameInput] = useState(name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const r = await updateProfileAction({ name: nameInput });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-base font-medium text-slate-900 dark:text-slate-50">Avatar</h2>
        <AvatarUpload userId={userId} name={name} email={email} currentImage={image} />
      </section>

      <section>
        <form onSubmit={onSave} className="space-y-4">
          <h2 className="text-base font-medium text-slate-900 dark:text-slate-50">Display name</h2>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              required
              maxLength={120}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={email} disabled readOnly />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Email cannot be changed here. Contact an admin if you need it updated.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            {savedAt && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved.</span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
