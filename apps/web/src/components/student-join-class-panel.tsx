"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { joinClassByCodeStudentAction, type JoinClassResult } from "@/app/actions/tracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

type StudentJoinClassPanelProps = {
  authUserId: string;
  userEmail: string | null;
  displayName: string | null;
};

export function StudentJoinClassPanel({ authUserId: _authUserId, userEmail: _userEmail, displayName: _displayName }: StudentJoinClassPanelProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function applyResult(result: JoinClassResult) {
    if (!result.ok) {
      setMessage(result.message);
      setIsError(true);
      return;
    }
    if (result.kind === "already_enrolled") {
      setMessage(`You’re already in ${result.className}.`);
      setIsError(false);
      return;
    }
    setMessage(`You’re now enrolled in ${result.className}.`);
    setIsError(false);
    setCode("");
    router.refresh();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      let result: JoinClassResult;
      if (isSupabaseConfigured()) {
        result = await joinClassByCodeStudentAction(code);
      } else {
        result = { ok: false, message: "Supabase must be configured to join a class on the server." };
      }
      applyResult(result);
    });
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg">Join a class</CardTitle>
        <CardDescription>
          Enter the join code from your teacher (letters and numbers). You’ll be added to the class roster.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onSubmit}>
          <label className="block min-w-0 flex-1 text-sm font-medium">
            Join code
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. WKEA31"
              className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 font-mono text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Joining…" : "Join class"}
          </Button>
        </form>
        {message ? (
          <p className={`mt-3 text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`} role={isError ? "alert" : "status"}>
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
