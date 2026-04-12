"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { AppRole } from "@/lib/auth";
import { PasswordInput } from "@/components/password-input";
import { claimStudentAccountsOnSignupAction } from "@/app/actions/tracker";

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fullName, setFullName] = useState(() => searchParams.get("name") ?? "");
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [appRole, setAppRole] = useState<AppRole>(() => (searchParams.get("role") === "student" ? "student" : "teacher"));
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setNeedsConfirmation(false);
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setMessage(
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local in apps/web.",
      );
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          app_role: appRole,
        },
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
      },
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data.session) {
      if (appRole === "student") {
        await claimStudentAccountsOnSignupAction();
      }
      router.push("/");
      router.refresh();
      return;
    }
    setNeedsConfirmation(true);
    setMessage("Account created. Check your inbox (and spam) for the confirmation email.");
  }

  async function resendConfirmation() {
    const supabase = createClient();
    if (!supabase || !email) {
      setMessage("Enter your email first.");
      return;
    }
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
      },
    });
    setResending(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Confirmation email re-sent. Please check inbox/spam.");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Choose whether you are a teacher or a student. You can add more roles later if needed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm font-medium">
              Full name
              <input
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Role</legend>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="role"
                    checked={appRole === "teacher"}
                    onChange={() => setAppRole("teacher")}
                  />
                  Teacher
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="role"
                    checked={appRole === "student"}
                    onChange={() => setAppRole("student")}
                  />
                  Student
                </label>
              </div>
            </fieldset>
            <label className="block text-sm font-medium">
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </label>
            <label className="block text-sm font-medium" htmlFor="signup-password">
              Password
              <PasswordInput
                id="signup-password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating…" : "Sign up"}
            </Button>
            {needsConfirmation ? (
              <Button type="button" variant="outline" className="w-full" onClick={resendConfirmation} disabled={resending}>
                {resending ? "Sending..." : "Resend confirmation email"}
              </Button>
            ) : null}
          </form>
          <Separator className="my-6" />
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
