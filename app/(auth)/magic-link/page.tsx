"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/better-auth/client";

export default function MagicLinkPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await authClient.signIn.magicLink({ email, callbackURL: "/" });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Failed to send link");
      return;
    }
    setSent(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Magic link sign-in</CardTitle>
        <CardDescription>We&apos;ll email you a one-time link.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-sm">Check {email} for the sign-in link.</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Sending…" : "Send link"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
