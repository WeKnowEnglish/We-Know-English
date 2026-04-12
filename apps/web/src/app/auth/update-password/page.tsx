"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MIN_LEN = 6;

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [noSession, setNoSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      if (!supabase) {
        if (!cancelled) {
          setNoSession(true);
          setSessionChecked(true);
        }
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) {
        if (!session) setNoSession(true);
        setSessionChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < MIN_LEN) {
      setMessage(`Password must be at least ${MIN_LEN} characters.`);
      return;
    }
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (!sessionChecked) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
        <p className="text-center text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (noSession) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Session required</CardTitle>
            <CardDescription>
              Open the reset link from your email again, request a new reset, or confirm Supabase is configured in
              .env.local.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link
              href="/auth/forgot-password"
              className={cn(buttonVariants({ variant: "default" }), "inline-flex w-full justify-center")}
            >
              Request reset link
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline" }), "inline-flex w-full justify-center")}
            >
              Back to log in
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>New password</CardTitle>
          <CardDescription>Choose a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm font-medium" htmlFor="update-password-new">
              New password
              <PasswordInput
                id="update-password-new"
                autoComplete="new-password"
                required
                minLength={MIN_LEN}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium" htmlFor="update-password-confirm">
              Confirm password
              <PasswordInput
                id="update-password-confirm"
                autoComplete="new-password"
                required
                minLength={MIN_LEN}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            {message ? <p className="text-sm text-destructive">{message}</p> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving…" : "Save password"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
                Cancel and return to log in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
