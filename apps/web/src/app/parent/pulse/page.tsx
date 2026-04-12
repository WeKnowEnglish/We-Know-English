"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { pulseFeed, students } from "@/lib/sample-data";
import type { FeedItemType } from "@/lib/tracker-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, ImageIcon, MessageSquare, Trophy } from "lucide-react";

function iconForType(type: FeedItemType) {
  switch (type) {
    case "photo":
      return ImageIcon;
    case "achievement":
      return Trophy;
    default:
      return MessageSquare;
  }
}

export default function DailyPulsePage() {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const hasStudents = students.length > 0;

  const entries = useMemo(() => {
    return pulseFeed
      .filter((e) => e.studentId === studentId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [studentId]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily Pulse</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chronological feed from the <code className="rounded bg-muted px-1 py-0.5 text-xs">feed</code> table,
          filtered by student (parent view).
        </p>
      </div>

      {hasStudents ? (
        <label className="text-sm font-medium">
          Child
          <select
            className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">No linked students yet. Data will load from your organization once available.</p>
      )}

      <div className="space-y-3">
        {entries.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No entries for this student yet.
            </CardContent>
          </Card>
        ) : (
          entries.map((entry) => {
            const Icon = iconForType(entry.type);
            const when = format(parseISO(entry.createdAt), "MMM d, yyyy · h:mm a");
            return (
              <Card key={entry.id}>
                <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-4 text-foreground" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {entry.type}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="size-3" aria-hidden />
                        {when}
                      </span>
                    </div>
                    <CardTitle className="text-base leading-snug">
                      {entry.content ?? "Update"}
                    </CardTitle>
                    <CardDescription className="font-mono text-xs">student_id: {entry.studentId}</CardDescription>
                  </div>
                </CardHeader>
                {entry.mediaUrl ? (
                  <>
                    <Separator />
                    <CardContent className="pt-0 text-sm text-muted-foreground">
                      Media: {entry.mediaUrl}
                    </CardContent>
                  </>
                ) : null}
              </Card>
            );
          })
        )}
      </div>
    </main>
  );
}
