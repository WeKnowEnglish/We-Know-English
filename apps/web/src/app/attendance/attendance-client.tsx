"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Save } from "lucide-react";
import { touchClassAccess } from "@/lib/classes-storage";
import {
  finalizeAttendanceSessionAction,
  reopenAttendanceSessionAction,
  saveAttendanceBundleAction,
  ensureAttendanceSessionAction,
} from "@/app/actions/attendance";
import {
  ATTENDANCE_STATUS_CYCLE,
  buildAttendanceUrl,
  isSessionUuid,
  normalizeAttendanceStatus,
  returnToDestination,
  rosterAttendanceSnapshot,
  parseSafeReturnTo,
} from "@/lib/attendance-utils";
import {
  buildOccurrenceKey,
  parseOccurrenceKey,
  pickPrimaryAttendanceOccurrence,
  sessionDateFromScheduleInstant,
} from "@/lib/class-schedule";
import type { AttendancePriorityRow, AttendanceSessionBundle } from "@/lib/tracker-queries";
import type { AttendanceStatus, ClassRoom, Student, StudentClassEnrollment } from "@/lib/tracker-types";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const EMPTY_ATTENDANCE: Record<string, AttendanceStatus> = {};

const classListNextSessionFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const scheduledSessionFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const sessionDateOnlyFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

function priorityKindLabel(kind: AttendancePriorityRow["kind"]): string {
  switch (kind) {
    case "in_session":
      return "In session";
    case "imminent":
      return "Starting soon";
    case "missed":
      return "Needs catch-up";
    default:
      return "";
  }
}

type SaveUiState = "idle" | "saving" | "saved" | "error";

export type AttendanceClientProps = {
  organizationId: string;
  scheduleTimeZone: string;
  initialClasses: ClassRoom[];
  initialStudents: Student[];
  initialEnrollments: StudentClassEnrollment[];
  /** Server-resolved classes that need attendance (in window / recent missed, not finalized). */
  priorityClasses: AttendancePriorityRow[];
  initialSessionBundle: AttendanceSessionBundle | null;
  classIdFromQuery: string | null;
  sessionIdFromQuery: string | null;
  occurrenceKeyFromQuery: string | null;
  sessionDateFromQuery: string | null;
  reopenFromQuery: boolean;
};

export function AttendanceClient({
  organizationId,
  scheduleTimeZone,
  initialClasses,
  initialStudents,
  initialEnrollments,
  priorityClasses,
  initialSessionBundle,
  classIdFromQuery,
  sessionIdFromQuery,
  occurrenceKeyFromQuery,
  sessionDateFromQuery,
  reopenFromQuery,
}: AttendanceClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = useMemo(() => parseSafeReturnTo(searchParams.get("returnTo")), [searchParams]);
  /** Preserve deep-link source through ensure/save URLs; default keeps “back” on the attendance class list. */
  const returnToForChainedNav = returnTo ?? "/attendance";
  const backTarget = useMemo(() => returnToDestination(returnTo), [returnTo]);
  const [pending, startTransition] = useTransition();
  const [classes, setClasses] = useState<ClassRoom[]>(initialClasses);
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [enrollments, setEnrollments] = useState<StudentClassEnrollment[]>(initialEnrollments);
  const [activeClassId, setActiveClassId] = useState(classIdFromQuery ?? "");
  const [sessionKey, setSessionKey] = useState(sessionIdFromQuery ?? "");
  const [occurrenceKey, setOccurrenceKey] = useState(occurrenceKeyFromQuery ?? "");
  const [sessionDate, setSessionDate] = useState(sessionDateFromQuery ?? "");
  const [finalized, setFinalized] = useState(initialSessionBundle?.finalized ?? false);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(() => {
    if (initialSessionBundle?.attendance && Object.keys(initialSessionBundle.attendance).length > 0) {
      return { ...initialSessionBundle.attendance };
    }
    return EMPTY_ATTENDANCE;
  });
  const [saveUi, setSaveUi] = useState<SaveUiState>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const ensureStartedRef = useRef(false);
  const saveSeq = useRef(0);
  const canAutosave = useRef(false);
  const attendanceRef = useRef(attendance);
  const lastPersistedSnapshotRef = useRef<string | null>(null);
  const classRosterRef = useRef<Student[]>([]);
  const persistToServerRef = useRef<() => Promise<boolean>>(async () => false);

  const activeClass = classes.find((c) => c.id === activeClassId) ?? null;
  const classRoster = useMemo(() => {
    if (!activeClassId) return [];
    const ids = new Set(enrollments.filter((e) => e.classId === activeClassId).map((e) => e.studentId));
    return students.filter((s) => ids.has(s.id));
  }, [activeClassId, enrollments, students]);
  attendanceRef.current = attendance;
  classRosterRef.current = classRoster;

  const createDefaultAttendanceForClass = useCallback(
    (classId: string) => {
      const ids = new Set(enrollments.filter((e) => e.classId === classId).map((e) => e.studentId));
      const next: Record<string, AttendanceStatus> = {};
      for (const s of students) {
        if (ids.has(s.id)) next[s.id] = "present";
      }
      return next;
    },
    [enrollments, students],
  );

  const mergeAttendanceWithRoster = useCallback(
    (base: Record<string, AttendanceStatus>, classId: string) => {
      const defaults = createDefaultAttendanceForClass(classId);
      return { ...defaults, ...base };
    },
    [createDefaultAttendanceForClass],
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      canAutosave.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    setClasses(initialClasses);
    setStudents(initialStudents);
    setEnrollments(initialEnrollments);
  }, [initialClasses, initialStudents, initialEnrollments]);

  useEffect(() => {
    if (initialSessionBundle && sessionIdFromQuery && isSessionUuid(sessionIdFromQuery)) {
      setFinalized(initialSessionBundle.finalized);
      const merged = mergeAttendanceWithRoster(initialSessionBundle.attendance, initialSessionBundle.classId);
      setAttendance(merged);
      setActiveClassId(initialSessionBundle.classId);
      setSessionKey(initialSessionBundle.sessionId);
      setOccurrenceKey(initialSessionBundle.occurrenceKey ?? "");
      const parsedOcc = parseOccurrenceKey(initialSessionBundle.occurrenceKey ?? "");
      setSessionDate(
        parsedOcc
          ? sessionDateFromScheduleInstant(parsedOcc.startsAt, scheduleTimeZone)
          : initialSessionBundle.sessionDate,
      );
      const rosterIds = enrollments
        .filter((e) => e.classId === initialSessionBundle.classId)
        .map((e) => e.studentId);
      lastPersistedSnapshotRef.current = rosterAttendanceSnapshot(merged, rosterIds);
    }
  }, [initialSessionBundle, sessionIdFromQuery, mergeAttendanceWithRoster, enrollments, scheduleTimeZone]);

  useEffect(() => {
    if (classIdFromQuery) setActiveClassId(classIdFromQuery);
  }, [classIdFromQuery]);

  useEffect(() => {
    if (sessionIdFromQuery && isSessionUuid(sessionIdFromQuery)) setSessionKey(sessionIdFromQuery);
  }, [sessionIdFromQuery]);

  useEffect(() => {
    if (occurrenceKeyFromQuery) setOccurrenceKey(occurrenceKeyFromQuery);
  }, [occurrenceKeyFromQuery]);

  useEffect(() => {
    if (sessionDateFromQuery) setSessionDate(sessionDateFromQuery);
  }, [sessionDateFromQuery]);

  /** New deep link (e.g. from missed popup) must be allowed to run `ensure` even if a prior visit left the ref true. */
  const occurrenceDeepLinkSig = `${classIdFromQuery ?? ""}\0${occurrenceKeyFromQuery ?? ""}\0${sessionDateFromQuery ?? ""}`;
  useEffect(() => {
    ensureStartedRef.current = false;
  }, [occurrenceDeepLinkSig]);

  /** Deep link: ensure DB session from occurrence before taking attendance */
  useEffect(() => {
    if (ensureStartedRef.current) return;

    const classId = (classIdFromQuery ?? activeClassId).trim();
    const occ = (occurrenceKeyFromQuery ?? occurrenceKey).trim();
    const sDate = (sessionDateFromQuery ?? sessionDate).trim();
    const hasDeepLinkParams = Boolean(
      classIdFromQuery?.trim() && occurrenceKeyFromQuery?.trim() && sessionDateFromQuery?.trim(),
    );
    const urlSessionId =
      sessionIdFromQuery && isSessionUuid(sessionIdFromQuery) ? sessionIdFromQuery : null;

    if (!organizationId || !classId || !occ || !sDate) return;
    if (urlSessionId) return;
    if (sessionKey && isSessionUuid(sessionKey) && !hasDeepLinkParams) return;

    ensureStartedRef.current = true;
    startTransition(async () => {
      const res = await ensureAttendanceSessionAction({
        organizationId,
        classId,
        occurrenceKey: occ,
        sessionDate: sDate,
      });
      if (!res.ok) {
        setSaveMessage(res.error);
        setSaveUi("error");
        ensureStartedRef.current = false;
        return;
      }
      setSessionKey(res.sessionId);
      setActiveClassId(classId);
      setOccurrenceKey(occ);
      setSessionDate(sDate);
      const next = mergeAttendanceWithRoster(attendanceRef.current, classId);
      setAttendance(next);
      const rids = enrollments.filter((e) => e.classId === classId).map((e) => e.studentId);
      lastPersistedSnapshotRef.current = rosterAttendanceSnapshot(next, rids);
      router.replace(
        buildAttendanceUrl({
          classId,
          sessionId: res.sessionId,
          returnTo: returnToForChainedNav,
        }),
      );
    });
  }, [
    organizationId,
    classIdFromQuery,
    occurrenceKeyFromQuery,
    sessionDateFromQuery,
    sessionIdFromQuery,
    activeClassId,
    occurrenceKey,
    sessionDate,
    sessionKey,
    router,
    mergeAttendanceWithRoster,
    enrollments,
    returnToForChainedNav,
  ]);

  /** `?reopen=1`: move session back to draft so the roster can be edited (from “My finalized sessions”). */
  useEffect(() => {
    if (!reopenFromQuery) return;
    if (!organizationId || !sessionKey || !isSessionUuid(sessionKey)) return;
    const cid = (activeClassId || classIdFromQuery || initialSessionBundle?.classId || "").trim();
    if (!cid) return;

    let cancelled = false;
    startTransition(async () => {
      const res = await reopenAttendanceSessionAction({
        organizationId,
        sessionId: sessionKey,
      });
      if (cancelled) return;
      if (!res.ok) {
        setSaveMessage(res.error);
        setSaveUi("error");
        return;
      }
      setFinalized(false);
      router.replace(
        buildAttendanceUrl({
          classId: cid,
          sessionId: sessionKey,
          returnTo: returnToForChainedNav,
        }),
      );
      router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [
    reopenFromQuery,
    organizationId,
    sessionKey,
    activeClassId,
    classIdFromQuery,
    initialSessionBundle?.classId,
    router,
    returnToForChainedNav,
  ]);

  const persistToServer = useCallback(async (): Promise<boolean> => {
    const MAX_CHAINED_SAVES = 25;
    let chains = 0;
    while (chains++ < MAX_CHAINED_SAVES) {
      const classId = activeClassId.trim();
      const sk = sessionKey.trim();
      const sd = sessionDate.trim();
      if (!classId || !sk || !isSessionUuid(sk) || !sd) return false;

      const roster = classRosterRef.current;
      const rosterIds = roster.map((s) => s.id);
      const snap = rosterAttendanceSnapshot(attendanceRef.current, rosterIds);
      if (snap === lastPersistedSnapshotRef.current) return true;
      if (rosterIds.length === 0) return false;

      const at = attendanceRef.current;
      const rows = roster.map((s) => ({
        studentId: s.id,
        status: at[s.id] ?? "present",
      }));
      const seq = ++saveSeq.current;
      setSaveUi("saving");
      setSaveMessage(null);
      const res = await saveAttendanceBundleAction({
        organizationId,
        classId,
        sessionId: sk,
        occurrenceKey: occurrenceKey || null,
        sessionDate: sd,
        rows,
      });
      if (seq !== saveSeq.current) {
        continue;
      }
      if (!res.ok) {
        setSaveUi("error");
        setSaveMessage(res.error);
        return false;
      }
      lastPersistedSnapshotRef.current = rosterAttendanceSnapshot(attendanceRef.current, rosterIds);
      setSaveUi("saved");
      setTimeout(() => {
        setSaveUi((u) => (u === "saved" ? "idle" : u));
      }, 2500);

      const snapAfter = rosterAttendanceSnapshot(attendanceRef.current, rosterIds);
      if (snapAfter === lastPersistedSnapshotRef.current) {
        return true;
      }
    }
    setSaveUi("error");
    setSaveMessage("Save could not finish—please try Save again.");
    return false;
  }, [organizationId, activeClassId, sessionKey, sessionDate, occurrenceKey]);

  persistToServerRef.current = persistToServer;

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void persistToServerRef.current();
    };
    const onPageHide = () => {
      void persistToServerRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  useEffect(() => {
    if (!canAutosave.current || finalized) return;
    if (!sessionKey || !isSessionUuid(sessionKey) || !sessionDate || !activeClassId) return;
    if (classRoster.length === 0) return;
    const snap = rosterAttendanceSnapshot(attendance, classRoster.map((s) => s.id));
    if (snap === lastPersistedSnapshotRef.current) return;

    const t = window.setTimeout(() => {
      startTransition(() => {
        void persistToServer();
      });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [attendance, sessionKey, sessionDate, activeClassId, classRoster, persistToServer, finalized]);

  const counts = useMemo(() => {
    const acc: Record<AttendanceStatus, number> = {
      present: 0,
      late: 0,
      absent_excused: 0,
      absent_unexcused: 0,
    };
    for (const st of Object.values(attendance)) {
      const k = normalizeAttendanceStatus(st);
      acc[k] += 1;
    }
    return acc;
  }, [attendance]);

  const startClassAttendance = (
    classId: string,
    preset?: { occurrenceKey: string; sessionDate: string } | null,
  ) => {
    const resolvedPreset = preset?.occurrenceKey?.trim() && preset?.sessionDate?.trim()
      ? { occurrenceKey: preset.occurrenceKey.trim(), sessionDate: preset.sessionDate.trim() }
      : null;

    if (resolvedPreset) {
      const { occurrenceKey: key, sessionDate: sd } = resolvedPreset;
      const defaults = createDefaultAttendanceForClass(classId);
      setActiveClassId(classId);
      setOccurrenceKey(key);
      setSessionDate(sd);
      setAttendance(defaults);
      setFinalized(false);
      startTransition(async () => {
        const res = await saveAttendanceBundleAction({
          organizationId,
          classId,
          sessionId: null,
          occurrenceKey: key,
          sessionDate: sd,
          rows: Object.entries(defaults).map(([studentId, status]) => ({ studentId, status })),
        });
        if (!res.ok) {
          setSaveMessage(res.error);
          setSaveUi("error");
          return;
        }
        setSessionKey(res.sessionId);
        lastPersistedSnapshotRef.current = rosterAttendanceSnapshot(defaults, Object.keys(defaults));
        router.replace(
          buildAttendanceUrl({
            classId,
            sessionId: res.sessionId,
            returnTo: returnToForChainedNav,
          }),
        );
      });
      return;
    }

    const classRoom = classes.find((c) => c.id === classId);
    const occ = classRoom ? pickPrimaryAttendanceOccurrence(classRoom, { scheduleTimeZone }) : null;
    if (!classRoom || !occ) {
      const defaults = createDefaultAttendanceForClass(classId);
      const sd = new Date().toISOString().slice(0, 10);
      setActiveClassId(classId);
      setSessionDate(sd);
      setOccurrenceKey("");
      setAttendance(defaults);
      setFinalized(false);
      startTransition(async () => {
        const res = await saveAttendanceBundleAction({
          organizationId,
          classId,
          sessionId: null,
          occurrenceKey: null,
          sessionDate: sd,
          rows: Object.entries(defaults).map(([studentId, status]) => ({ studentId, status })),
        });
        if (!res.ok) {
          setSaveMessage(res.error);
          setSaveUi("error");
          return;
        }
        setSessionKey(res.sessionId);
        lastPersistedSnapshotRef.current = rosterAttendanceSnapshot(defaults, Object.keys(defaults));
        router.replace(
          buildAttendanceUrl({
            classId,
            sessionId: res.sessionId,
            returnTo: returnToForChainedNav,
          }),
        );
      });
      return;
    }
    const key = buildOccurrenceKey(occ.classId, occ.slotId, occ.startsAt);
    const sd = sessionDateFromScheduleInstant(occ.startsAt, scheduleTimeZone);
    const defaults = createDefaultAttendanceForClass(classId);
    setActiveClassId(classId);
    setOccurrenceKey(key);
    setSessionDate(sd);
    setAttendance(defaults);
    setFinalized(false);
    startTransition(async () => {
      const res = await saveAttendanceBundleAction({
        organizationId,
        classId,
        sessionId: null,
        occurrenceKey: key,
        sessionDate: sd,
        rows: Object.entries(defaults).map(([studentId, status]) => ({ studentId, status })),
      });
      if (!res.ok) {
        setSaveMessage(res.error);
        setSaveUi("error");
        return;
      }
      setSessionKey(res.sessionId);
      lastPersistedSnapshotRef.current = rosterAttendanceSnapshot(defaults, Object.keys(defaults));
      router.replace(
        buildAttendanceUrl({
          classId,
          sessionId: res.sessionId,
          returnTo: returnToForChainedNav,
        }),
      );
    });
  };

  const updateStatus = (studentId: string) => {
    setAttendance((current) => {
      const cur = normalizeAttendanceStatus(current[studentId] ?? "present");
      let idx = ATTENDANCE_STATUS_CYCLE.indexOf(cur);
      if (idx < 0) idx = 0;
      const next = ATTENDANCE_STATUS_CYCLE[(idx + 1) % ATTENDANCE_STATUS_CYCLE.length];
      return { ...current, [studentId]: next };
    });
  };

  const onSaveClick = () => {
    startTransition(() => void persistToServer());
  };

  const onFinalize = () => {
    if (!sessionKey || !isSessionUuid(sessionKey)) return;
    startTransition(async () => {
      /** Always persist roster first so “all present” / unchanged tiles still write rows before finalize. */
      const saved = await persistToServer();
      if (!saved) return;
      const res = await finalizeAttendanceSessionAction({ organizationId, sessionId: sessionKey });
      if (!res.ok) {
        setSaveMessage(res.error);
        setSaveUi("error");
        return;
      }
      setFinalized(true);
      lastPersistedSnapshotRef.current = rosterAttendanceSnapshot(
        attendanceRef.current,
        classRoster.map((s) => s.id),
      );
      setSaveUi("saved");
      router.refresh();
    });
  };

  const hasActiveSession = Boolean(activeClassId && sessionKey);
  const isDbSession = isSessionUuid(sessionKey);

  const sessionAttendanceSummary = useMemo(() => {
    const parsed = occurrenceKey?.trim() ? parseOccurrenceKey(occurrenceKey.trim()) : null;
    if (parsed) {
      return `Scheduled session — ${scheduledSessionFormatter.format(parsed.startsAt)}`;
    }
    const sd = sessionDate?.trim();
    if (sd && /^\d{4}-\d{2}-\d{2}$/.test(sd)) {
      return `Non-scheduled attendance — ${sessionDateOnlyFormatter.format(new Date(`${sd}T12:00:00`))}`;
    }
    return "Non-scheduled attendance";
  }, [occurrenceKey, sessionDate]);

  useEffect(() => {
    if (activeClassId && sessionKey) touchClassAccess(activeClassId);
  }, [activeClassId, sessionKey]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Class Attendance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasActiveSession && finalized
            ? `Viewing a finalized session—read only. When you are done, use “${backTarget.label}”.`
            : hasActiveSession
              ? "Mark each student, then save. Data syncs to your organization automatically after a short pause."
              : "Pick a class, mark each student, then save. Data syncs to your organization automatically after a short pause."}
        </p>
      </div>

      {!hasActiveSession ? (
        <>
          <div className="-mt-2 mb-2 flex justify-end">
            <Link
              href="/attendance/finalized-by-me"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              My finalized sessions
            </Link>
          </div>
          <Card>
          <CardHeader>
            <CardTitle className="text-base">Classes needing attention</CardTitle>
            <CardDescription>
              In session, starting within 30 minutes, or finished recently without finalized attendance (last 72 hours).
              Finalized sessions are hidden here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {priorityClasses.length > 0 ? (
              priorityClasses.map((row) => (
                <button
                  key={`${row.classId}-${row.occurrenceKey}`}
                  type="button"
                  onClick={() =>
                    startClassAttendance(row.classId, {
                      occurrenceKey: row.occurrenceKey,
                      sessionDate: row.sessionDate,
                    })
                  }
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{row.className}</p>
                    <p className="text-sm text-muted-foreground">
                      {classListNextSessionFormatter.format(new Date(row.startsAt))}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0",
                      row.kind === "in_session" && "border-emerald-500/50 text-emerald-800 dark:text-emerald-200",
                      row.kind === "imminent" && "border-amber-500/50 text-amber-900 dark:text-amber-100",
                      row.kind === "missed" && "border-sky-500/50 text-sky-900 dark:text-sky-100",
                    )}
                  >
                    {priorityKindLabel(row.kind)}
                  </Badge>
                </button>
              ))
            ) : (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>No classes need attendance at this moment.</p>
                <p>
                  Use{" "}
                  <Link href="/schedule" className="font-medium text-foreground underline underline-offset-2">
                    Schedule
                  </Link>{" "}
                  for other dates, or{" "}
                  <Link
                    href="/attendance/missed"
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    Missed sessions
                  </Link>{" "}
                  for older catch-up.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{activeClass?.name ?? "Class"}</Badge>
            {isDbSession ? (
              <span className="text-xs text-muted-foreground tabular-nums" title={`Session ID: ${sessionKey}`}>
                {sessionKey.slice(0, 8)}…
              </span>
            ) : null}
            {finalized ? (
              <Badge variant="default">Finalized</Badge>
            ) : (
              <Badge variant="secondary">Draft</Badge>
            )}
            <Button type="button" variant="outline" size="sm" disabled={pending || !isDbSession} onClick={onSaveClick}>
              <Save className="size-4" data-icon="inline-start" />
              Save
            </Button>
            <Button type="button" size="sm" disabled={pending || !isDbSession || finalized} onClick={onFinalize}>
              Finalize
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveClassId("");
                setSessionKey("");
                setOccurrenceKey("");
                setSessionDate("");
                setAttendance(EMPTY_ATTENDANCE);
                setFinalized(false);
                ensureStartedRef.current = false;
                lastPersistedSnapshotRef.current = null;
                router.push(backTarget.href);
              }}
            >
              {backTarget.label}
            </Button>
            </div>
            <p className="text-sm text-muted-foreground">{sessionAttendanceSummary}</p>
          </div>

          {saveMessage && saveUi === "error" ? (
            <p className="text-sm text-destructive" role="alert">
              {saveMessage}
            </p>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Session summary</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{sessionAttendanceSummary}</p>
                  <CardDescription className="mt-2">
                    {finalized
                      ? "This session is finalized. Student tiles are shown for reference only."
                      : "Tap tiles to cycle: present → late → absent (unexcused) → absent (excused)."}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {saveUi === "saving" ? (
                    <span className="text-xs text-muted-foreground">Saving…</span>
                  ) : null}
                  {saveUi === "saved" ? (
                    <span
                      className="flex size-8 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white animate-pulse"
                      title="Saved"
                      aria-hidden
                    >
                      !
                    </span>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                <Check className="size-3" /> Present: {counts.present}
              </Badge>
              <Badge variant="outline">Late: {counts.late}</Badge>
              <Badge variant="outline">Absent (unexcused): {counts.absent_unexcused}</Badge>
              <Badge variant="outline">Absent (excused): {counts.absent_excused}</Badge>
            </CardContent>
          </Card>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {classRoster.map((student) => (
              <button
                key={student.id}
                type="button"
                disabled={finalized}
                onClick={() => updateStatus(student.id)}
                className={cn(
                  "rounded-xl border bg-card p-4 text-left shadow-xs transition-colors hover:bg-accent/50",
                  attendance[student.id] === "present" && "border-primary/40 ring-1 ring-primary/20",
                  attendance[student.id] === "late" && "border-amber-300 bg-amber-50/40",
                  attendance[student.id] === "absent_unexcused" && "border-red-300 bg-red-50/40",
                  attendance[student.id] === "absent_excused" && "border-sky-300 bg-sky-50/40",
                  finalized && "cursor-default hover:bg-card",
                )}
              >
                <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                  {student.avatar?.trim() ? student.avatar : student.fullName.slice(0, 2).toUpperCase()}
                </div>
                <div className="font-medium">{student.fullName}</div>
                <div className="text-sm text-muted-foreground">{student.level}</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {(attendance[student.id] ?? "present").replace(/_/g, " ")}
                </div>
              </button>
            ))}
            {classRoster.length === 0 ? (
              <Card className="sm:col-span-2 lg:col-span-4">
                <CardContent className="py-5 text-sm text-muted-foreground">
                  This class has no enrolled students yet.
                </CardContent>
              </Card>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
