"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { acceptInvitationAction } from "@/lib/server-actions/users";
import { authClient } from "@/lib/better-auth/client";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-8 text-sm text-slate-500 backdrop-blur dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          Loading…
        </div>
      }
    >
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");

  if (!token) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-sm shadow-xl shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/60 sm:p-8">
        <h1 className="mb-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Invitation required
        </h1>
        <p className="text-slate-600 dark:text-slate-300">
          Self-signup is disabled. Ask your administrator for an invitation link, or{" "}
          <Link
            href="/login"
            className="text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400"
          >
            sign in
          </Link>{" "}
          if you already have an account.
        </p>
      </div>
    );
  }

  return <SignupForm token={token} router={router} />;
}

function SignupForm({
  token,
  router,
}: {
  token: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setPending(true);
    const r = await acceptInvitationAction({ token, name: name.trim(), password });
    if (!r.ok) {
      setPending(false);
      setError(r.error.message);
      return;
    }
    // Account created. Sign the new user in so they land on their dashboard.
    const signInRes = await authClient.signIn.email({
      email: r.data.email,
      password,
    });
    setPending(false);
    if (signInRes.error) {
      setError("Account created but auto sign-in failed. Try signing in manually.");
      router.push("/login");
      return;
    }
    router.push("/post-login");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-slate-950/30 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Set up your account
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Finish creating your FlowLeadz account.
        </p>
      </div>

      {error && (
        <Alert className="mb-4" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Your name
          </Label>
          <Input
            id="name"
            type="text"
            required
            maxLength={200}
            placeholder="Alice Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="password"
            className="text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            Password
          </Label>
          <Input
            id="password"
            type="password"
            required
            minLength={12}
            placeholder="At least 12 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="confirm"
            className="text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            Confirm password
          </Label>
          <Input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-10"
          />
        </div>
        <Button
          type="submit"
          className="h-10 w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/20 transition hover:from-indigo-600 hover:to-violet-600 hover:shadow-lg hover:shadow-indigo-500/30"
          disabled={pending}
        >
          {pending ? (
            "Creating account…"
          ) : (
            <>
              Create account
              <ArrowRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-slate-700 transition hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
