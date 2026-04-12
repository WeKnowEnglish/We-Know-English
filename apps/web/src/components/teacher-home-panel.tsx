"use client";

import Link from "next/link";
import { buildAttendanceUrl } from "@/lib/attendance-utils";
import { nextSessionInstantOrNull } from "@/lib/class-schedule";
import type { ClassRoom } from "@/lib/tracker-types";

type TeacherHomePanelProps = {
  welcomeName: string;
  dateTimeLabel: string;
  recentClasses: ClassRoom[];
};

export function TeacherHomePanel({ welcomeName, dateTimeLabel, recentClasses }: TeacherHomePanelProps) {
  const upcomingClassReminders = recentClasses.map((classRoom) => {
    const next = nextSessionInstantOrNull(classRoom);
    const startsAtLabel = next
      ? new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(next)
      : "no session scheduled yet";
    return { id: classRoom.id, name: classRoom.name, startsAtLabel };
  });

  return (
    <>
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">{dateTimeLabel}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Welcome back {welcomeName}!</h1>
        <div className="mt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Upcoming class reminders</h2>
          {upcomingClassReminders.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-foreground">
              {upcomingClassReminders.map((reminder) => (
                <li key={reminder.id}>
                  {reminder.name} — <span className="text-muted-foreground">next session {reminder.startsAtLabel}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No classes yet. Create one below.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Classes</h2>
        </div>
        {recentClasses.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {recentClasses.map((classRoom) => (
              <Link
                key={classRoom.id}
                href={buildAttendanceUrl({ classId: classRoom.id, returnTo: "/" })}
                title={`Open ${classRoom.name}`}
                className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-muted hover:text-foreground"
              >
                {classRoom.name}
              </Link>
            ))}
            <Link
              href="/onboarding"
              className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] bg-primary px-2.5 text-[0.8rem] font-medium text-primary-foreground transition-colors hover:bg-primary/80"
            >
              Create a class
            </Link>
          </div>
        ) : (
          <Link
            href="/onboarding"
            className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] bg-primary px-2.5 text-[0.8rem] font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            Create a class
          </Link>
        )}
      </section>
    </>
  );
}
