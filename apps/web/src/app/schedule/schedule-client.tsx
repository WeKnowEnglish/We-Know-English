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
const DEFAULT_CLASS_DURATION_MS = 50 * 60 * 1000;
const ATTENDANCE_IMMINENT_MS = 30 * 60 * 1000;
const ATTENDANCE_MISSED_RECENT_MS = 72 * 60 * 60 * 1000;

function attendanceWindowKind(startsAtIso: string): "in_session" | "imminent" | "missed" | null {
  const startMs = +new Date(startsAtIso);
  if (Number.isNaN(startMs)) return null;
  const nowMs = Date.now();
  const endMs = startMs + DEFAULT_CLASS_DURATION_MS;
  if (nowMs >= startMs && nowMs < endMs) return "in_session";
  if (nowMs < startMs && startMs <= nowMs + ATTENDANCE_IMMINENT_MS) return "imminent";
  if (nowMs >= endMs && nowMs - endMs <= ATTENDANCE_MISSED_RECENT_MS) return "missed";
  return null;
}

export type ScheduleClientProps = {
  organizationId: string;
  scheduleTimeZone: string;
  orgRole: "owner" | "staff" | "client";
  initialMyClassIds: string[];
  initialAllClasses: ClassRoom[];
  initialMyClasses: ClassRoom[];
};

function attendanceHrefForScheduleEvent(
  ev: { classId: string; slotId: string; startsAt: string },
  occurrenceSessionMap: Record<string, { sessionId: string; attendanceFinalized: boolean }>,
  scheduleTimeZone: string,
): string {
  const occurrenceKey = buildOccurrenceKey(ev.classId, ev.slotId, ev.startsAt);
  const sessionDate = sessionDateFromScheduleInstant(ev.startsAt, scheduleTimeZone);
  const hit = occurrenceSessionMap[occurrenceKey];
  return buildAttendanceUrl({
    classId: ev.classId,
    sessionId: hit?.sessionId ?? null,
    occurrenceKey: hit?.sessionId ? null : occurrenceKey,
    sessionDate: hit?.sessionId ? null : sessionDate,
    returnTo: "/schedule",
  });
}

export function ScheduleClient({
  organizationId,
  scheduleTimeZone,
  orgRole,
  initialMyClassIds,
  initialAllClasses,
  initialMyClasses,
}: ScheduleClientProps) {
  const router = useRouter();
  const [cursor, setCursor] = useState(() => new Date());
  const [filterMode, setFilterMode] = useState<"all" | "mine">(orgRole === "owner" ? "all" : "mine");
  const [allClasses, setAllClasses] = useState<ClassRoom[]>(initialAllClasses);
  const [myClasses, setMyClasses] = useState<ClassRoom[]>(initialMyClasses);
  const [myClassIds] = useState<string[]>(initialMyClassIds);

  useEffect(() => {
    setAllClasses(initialAllClasses);
    setMyClasses(initialMyClasses);
  }, [initialAllClasses, initialMyClasses]);

  const classes = useMemo(() => {
    if (orgRole === "owner") return filterMode === "all" ? allClasses : myClasses;
    return myClasses;
  }, [orgRole, filterMode, allClasses, myClasses]);

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
    () => getScheduleEvents(classes, rangeStart, rangeEnd, scheduleTimeZone),
    [classes, rangeStart, rangeEnd, scheduleTimeZone],
  );

  const [occurrenceSessionMap, setOccurrenceSessionMap] = useState<
    Record<string, { sessionId: string; attendanceFinalized: boolean }>
  >({});
  const [selectedOccurrenceKey, setSelectedOccurrenceKey] = useState<string | null>(null);

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

  const eventByOccurrenceKey = useMemo(() => {
    const map = new Map<string, (typeof events)[number]>();
    for (const ev of events) {
      map.set(buildOccurrenceKey(ev.classId, ev.slotId, ev.startsAt), ev);
    }
    return map;
  }, [events]);

  const selectedEvent = selectedOccurrenceKey ? eventByOccurrenceKey.get(selectedOccurrenceKey) ?? null : null;
  const selectedEventFinalized =
    selectedEvent != null
      ? occurrenceSessionMap[buildOccurrenceKey(selectedEvent.classId, selectedEvent.slotId, selectedEvent.startsAt)]
          ?.attendanceFinalized === true
      : false;
  const selectedEventWindowKind = selectedEvent ? attendanceWindowKind(selectedEvent.startsAt) : null;
  const canTakeAttendance = Boolean(selectedEvent && !selectedEventFinalized && selectedEventWindowKind !== null);
  const selectedEventAttendanceHref = selectedEvent
    ? attendanceHrefForScheduleEvent(selectedEvent, occurrenceSessionMap, scheduleTimeZone)
    : null;
  const sessionDetailFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [],
  );

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">Month view of all class sessions from your stored classes.</p>
        </div>
        <div className="flex items-center gap-2">
          {orgRole === "owner" ? (
            <select
              value={filterMode}
              onChange={(event) => setFilterMode(event.target.value === "mine" ? "mine" : "all")}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <option value="all">All classes in organization</option>
              <option value="mine">Only my assigned classes</option>
            </select>
          ) : null}
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

      {orgRole === "owner" && filterMode === "mine" && myClassIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You are an admin/owner, but no classes are directly assigned to you as lead, co-teacher, or assistant.
        </p>
      ) : null}

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
                        <button
                          key={occKey}
                          type="button"
                          title={
                            finalized === true
                              ? `${ev.className} — view finalized attendance`
                              : `${ev.className} — view details`
                          }
                          onClick={() => setSelectedOccurrenceKey(occKey)}
                          className="w-full truncate rounded border border-border/80 bg-muted/40 px-1 py-0.5 text-left text-[10px] font-medium leading-tight hover:bg-accent sm:text-xs"
                        >
                          <span className="text-muted-foreground">{timeFormatter.format(new Date(ev.startsAt))}</span>{" "}
                          {ev.className}
                        </button>
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

      {selectedEvent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-lg">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{selectedEvent.className}</h2>
                <p className="text-sm text-muted-foreground">
                  {sessionDetailFormatter.format(new Date(selectedEvent.startsAt))}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedOccurrenceKey(null)}>
                Close
              </Button>
            </div>

            <div className="mb-4 space-y-1 text-sm">
              <p>
                <span className="font-medium">Status:</span> {selectedEventFinalized ? "Finalized" : "Not finalized"}
              </p>
              <p>
                <span className="font-medium">Attendance window:</span>{" "}
                {selectedEventWindowKind === "in_session"
                  ? "In session"
                  : selectedEventWindowKind === "imminent"
                    ? "Starting soon"
                    : selectedEventWindowKind === "missed"
                      ? "Missed but still editable"
                      : "Outside attendance window"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedEventAttendanceHref ? (
                selectedEventFinalized ? (
                  <Link
                    href={selectedEventAttendanceHref}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    onClick={() => setSelectedOccurrenceKey(null)}
                  >
                    View attendance
                  </Link>
                ) : canTakeAttendance ? (
                  <Link
                    href={selectedEventAttendanceHref}
                    className={cn(buttonVariants({ variant: "default", size: "sm" }))}
                    onClick={() => setSelectedOccurrenceKey(null)}
                  >
                    Take attendance
                  </Link>
                ) : (
                  <Button type="button" size="sm" disabled>
                    Take attendance
                  </Button>
                )
              ) : null}
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedOccurrenceKey(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Link href="/onboarding" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to classes
      </Link>
    </main>
  );
}
