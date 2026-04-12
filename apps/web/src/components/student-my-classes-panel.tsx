"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { leaveClassEnrollmentStudentAction } from "@/app/actions/tracker";
import type { StudentEnrollmentClassSummary } from "@/lib/tracker-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

type StudentMyClassesPanelProps = {
  enrollments: StudentEnrollmentClassSummary[];
};

export function StudentMyClassesPanel({ enrollments: initial }: StudentMyClassesPanelProps) {
  const router = useRouter();
  const [enrollments, setEnrollments] = useState(initial);
  useEffect(() => {
    setEnrollments(initial);
  }, [initial]);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onLeave(classId: string, className: string) {
    if (!window.confirm(`Leave “${className}”? You can join again later with the class code.`)) {
      return;
    }
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      if (!isSupabaseConfigured()) {
        setMessage("Supabase must be configured to update enrollments.");
        setIsError(true);
        return;
      }
      const result = await leaveClassEnrollmentStudentAction(classId);
      if (!result.ok) {
        setMessage(result.message);
        setIsError(true);
        return;
      }
      setEnrollments((rows) => rows.filter((r) => r.classId !== classId));
      setMessage(`You left ${result.className}.`);
      setIsError(false);
      router.refresh();
    });
  }

  if (enrollments.length === 0) {
    return (
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg">Your classes</CardTitle>
          <CardDescription>
            When you join a class with a code, it appears here. You can leave a class anytime and rejoin with the same code.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg">Your classes</CardTitle>
        <CardDescription>Leave a class if you are switching groups; your account stays active.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {enrollments.map((row) => (
          <div
            key={`${row.organizationId}-${row.classId}`}
            className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium text-foreground">{row.className}</p>
              <p className="text-xs text-muted-foreground">
                Joined{" "}
                {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(row.joinedAt))}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              className="shrink-0"
              onClick={() => onLeave(row.classId, row.className)}
            >
              Leave class
            </Button>
          </div>
        ))}
        {message ? (
          <p className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`} role={isError ? "alert" : "status"}>
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
