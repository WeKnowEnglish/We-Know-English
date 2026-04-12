"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { buildAttendanceUrl } from "@/lib/attendance-utils";
import { buildOccurrenceKey, getScheduleEvents, sessionDateFromScheduleInstant } from "@/lib/class-schedule";
import { fetchAttendanceOccurrenceStatusMapAction } from "@/app/actions/attendance";
import type { ClassRoom } from "@/lib/tracker-types";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const WEEK_OPTIONS = { weekStartsOn: 0 as const };

export type ScheduleClientProps = {
  organizationId: string;
  initialClasses: ClassRoom[];
};

function attendanceHrefForScheduleEvent(
  ev: { classId: string; slotId: string; startsAt: string },
  occurrenceSessionMap: Record<string, { sessionId: string; attendanceFinalized: boolean }>,
): string {
  const occurrenceKey = buildOccurrenceKey(ev.classId, ev.slotId, ev.startsAt);
  const sessionDate = sessionDateFromScheduleInstant(ev.startsAt);
  const hit = occurrenceSessionMap[occurrenceKey];
  return buildAttendanceUrl({
    classId: ev.classId,
    sessionId: hit?.sessionId ?? null,
    occurrenceKey: hit?.sessionId ? null : occurrenceKey,
    sessionDate: hit?.sessionId ? null : sessionDate,
    returnTo: "/schedule",
  });
}

export function ScheduleClient({ organizationId, initialClasses }: ScheduleClientProps) {
  const router = useRouter();
  const [cursor, setCursor] = useState(() => new Date());
  const [classes, setClasses] = useState<ClassRoom[]>(initialClasses);

  useEffect(() => {
    setClasses(initialClasses);
  }, [initialClasses]);

  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }),
    [],
  );

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, WEEK_OPTIONS);
  const gridEnd = endOfWeek(monthEnd, WEEK_OPTIONS);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const rangeStart = useMemo(
    () => startOfWeek(startOfMonth(subMonths(cursor, 1)), WEEK_OPTIONS),
    [cursor],
  );
  const rangeEnd = useMemo(() => endOfWeek(endOfMonth(addMonths(cursor, 1)), WEEK_OPTIONS), [cursor]);

  const events = useMemo(
    () => getScheduleEvents(classes, rangeStart, rangeEnd),
    [classes, rangeStart, rangeEnd],
  );

  const [occurrenceSessionMap, setOccurrenceSessionMap] = useState<
    Record<string, { sessionId: string; attendanceFinalized: boolean }>
  >({});

  useEffect(() => {
    const keys = [...new Set(events.map((e) => buildOccurrenceKey(e.classId, e.slotId, e.startsAt)))];
    if (!organizationId || keys.length === 0) {
      setOccurrenceSessionMap({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const map = await fetchAttendanceOccurrenceStatusMapAction({
        organizationId,
        occurrenceKeys: keys,
      });
      if (!cancelled) setOccurrenceSessionMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, events]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const event of events) {
      const key = format(new Date(event.startsAt), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    }
    return map;
  }, [events]);

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">Month view of all class sessions from your stored classes.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setCursor((d) => addMonths(d, -1))}>
            Previous
          </Button>
          <p className="min-w-[10rem] text-center text-sm font-medium">{format(cursor, "MMMM yyyy")}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setCursor((d) => addMonths(d, 1))}>
            Next
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => router.refresh()}>
            Refresh
          </Button>
        </div>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No sessions scheduled</CardTitle>
            <CardDescription>
              Add one-off slots or a weekly repeat on each class page, or create a class with a default session time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/onboarding" className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
              Go to classes
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-3 pt-4 sm:p-4">
          <div className="grid grid-cols-7 gap-px rounded-lg border border-border bg-border text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
            {weekdayLabels.map((label) => (
              <div key={label} className="bg-muted/40 py-2">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px rounded-b-lg border border-t-0 border-border bg-border">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, cursor);
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={key}
                  className={cn(
                    "flex min-h-[5.5rem] flex-col gap-0.5 bg-background p-1 sm:min-h-[6.5rem] sm:p-1.5",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium sm:size-7 sm:text-sm",
                        isToday && "bg-primary text-primary-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
                    {dayEvents.slice(0, 4).map((ev) => {
                      const occKey = buildOccurrenceKey(ev.classId, ev.slotId, ev.startsAt);
                      const finalized = occurrenceSessionMap[occKey]?.attendanceFinalized;
                      return (
                        <Link
                          key={occKey}
                          href={attendanceHrefForScheduleEvent(ev, occurrenceSessionMap)}
                          title={
                            finalized === true
                              ? `${ev.className} — view finalized attendance`
                              : `${ev.className} — take or continue attendance`
                          }
                          className="truncate rounded border border-border/80 bg-muted/40 px-1 py-0.5 text-[10px] font-medium leading-tight hover:bg-accent sm:text-xs"
                        >
                          <span className="text-muted-foreground">{timeFormatter.format(new Date(ev.startsAt))}</span>{" "}
                          {ev.className}
                        </Link>
                      );
                    })}
                    {dayEvents.length > 4 ? (
                      <p className="text-[10px] text-muted-foreground sm:text-xs">+{dayEvents.length - 4} more</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Link href="/onboarding" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to classes
      </Link>
    </main>
  );
}
