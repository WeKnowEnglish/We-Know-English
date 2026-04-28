"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttendanceHistoryRow } from "@/lib/tracker-queries";
import type { ClassRoom, FeedEntry, Student } from "@/lib/tracker-types";

type StudentDetailClientProps = {
  student: Student;
  enrolledClasses: ClassRoom[];
  recentUpdates: FeedEntry[];
  attendanceHistory: AttendanceHistoryRow[];
};

export function StudentDetailClient({
  student,
  enrolledClasses,
  recentUpdates,
  attendanceHistory,
}: StudentDetailClientProps) {
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const hasEmail = Boolean(student.email?.trim());
  const hasLinkedAccount = Boolean(student.linkedAuthUserId);

  const createInviteLink = () => {
    if (!hasEmail) return;
    const params = new URLSearchParams({
      role: "student",
      email: student.email,
      name: student.fullName,
    });
    const link = `${window.location.origin}/signup?${params.toString()}`;
    setInviteLink(link);
    setCopied(false);
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{student.fullName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Teacher view for this student profile.</p>
        </div>
        <Badge variant="secondary">Role: student</Badge>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Current level</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-medium">{student.level}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Skill points</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-medium">{student.skillsPoints}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Email: {hasEmail ? student.email : "Not set"}</p>
            <p>Status: {student.accountStatus}</p>
            <p>Gender: {student.gender}</p>
            <p>Birthday: {student.birthday || "—"}</p>
            <p>Classes: {enrolledClasses.length}</p>
          </CardContent>
        </Card>
      </section>

      {!hasLinkedAccount ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite</CardTitle>
            <CardDescription>
              Create a signup link so this student can register and link to this roster row. Add an email on the student
              record first if the button is disabled.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button type="button" size="sm" onClick={createInviteLink} disabled={!hasEmail}>
              Create invite link
            </Button>
            {inviteLink ? (
              <div className="space-y-2">
                <input
                  readOnly
                  value={inviteLink}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none"
                />
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={copyInviteLink}>
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                  <a
                    href={inviteLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Open invite link
                  </a>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance</CardTitle>
          <CardDescription>Recent finalized and draft marks from class sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {attendanceHistory.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {attendanceHistory.slice(0, 40).map((row) => (
                <li key={row.id} className="flex flex-wrap justify-between gap-2 rounded-md border border-border px-3 py-2">
                  <span className="font-medium">{row.className}</span>
                  <span className="text-muted-foreground">{row.sessionDate}</span>
                  <span className="w-full text-muted-foreground sm:w-auto">
                    {row.status.replace(/_/g, " ")}
                    {row.finalized ? "" : " · draft"}
                  </span>
                  {row.markedByName ? (
                    <span className="text-xs text-muted-foreground">by {row.markedByName}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No attendance rows yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Class enrollments</CardTitle>
          <CardDescription>All classes this student currently belongs to.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {enrolledClasses.length > 0 ? (
            enrolledClasses.map((classRoom) => (
              <Link
                key={classRoom.id}
                href={`/onboarding/${encodeURIComponent(classRoom.id)}`}
                className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground underline-offset-4 hover:underline"
              >
                {classRoom.name}
              </Link>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No class enrollments yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent updates</CardTitle>
          <CardDescription>Latest parent-feed moments tied to this student.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentUpdates.length > 0 ? (
            recentUpdates.map((update) => (
              <div key={update.id} className="rounded-lg border border-border px-3 py-2">
                <p className="text-sm font-medium capitalize">{update.type}</p>
                <p className="text-sm text-muted-foreground">{update.content ?? "No note provided."}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No recent updates yet.</p>
          )}
        </CardContent>
      </Card>

      <Link href="/students" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to students
      </Link>
    </main>
  );
}
