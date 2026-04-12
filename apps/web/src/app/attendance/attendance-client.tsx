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
  nextSessionInstantOrNull,
  parseOccurrenceKey,
  pickPrimaryAttendanceOccurrence,
  sessionDateFromScheduleInstant,
} from "@/lib/class-schedule";
import type { AttendanceSessionBundle } from "@/lib/tracker-queries";
import type { AttendanceStatus, ClassRoom, Student, StudentClassEnrollment } from "@/lib/tracker-types";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const EMPTY_ATTENDANCE: Record<string, AttendanceStatus> = {};
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

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

function formatClassNextSessionLabel(classRoom: ClassRoom): string {
  const next = nextSessionInstantOrNull(classRoom);
  return next ? classListNextSessionFormatter.format(next) : "Not scheduled";
}

type SaveUiState = "idle" | "saving" | "saved" | "error";

export type AttendanceClientProps = {
  organizationId: string;
  initialClasses: ClassRoom[];
  initialStudents: Student[];
  initialEnrollments: StudentClassEnrollment[];
  initialSessionBundle: AttendanceSessionBundle | null;
  classIdFromQuery: string | null;
  sessionIdFromQuery: string | null;
  occurrenceKeyFromQuery: string | null;
  sessionDateFromQuery: string | null;
  reopenFromQuery: boolean;
};

export function AttendanceClient({
  organizationId,
  initialClasses,
  initialStudents,
  initialEnrollments,
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

  const orderedClasses = useMemo(() => {
    return [...classes].sort((a, b) => {
      const aTime = nextSessionInstantOrNull(a)?.getTime() ?? +new Date(a.updatedAt);
      const bTime = nextSessionInstantOrNull(b)?.getTime() ?? +new Date(b.updatedAt);
      return aTime - bTime;
    });
  }, [classes]);

  const classHasEnrollments = useCallback(
    (classId: string) => enrollments.some((e) => e.classId === classId),
    [enrollments],
  );

  const isClassUnlocked = useCallback(
    (classRoom: ClassRoom) => {
      if (!classHasEnrollments(classRoom.id)) return false;
      const nowMs = Date.now();
      const nextInstant = nextSessionInstantOrNull(classRoom);
      if (nextInstant) {
        const delta = nextInstant.getTime() - nowMs;
        if (delta >= 0 && delta <= TWENTY_FOUR_HOURS_MS) return true;
      }
      const occ = pickPrimaryAttendanceOccurrence(classRoom);
      if (!occ) return false;
      const t = +new Date(occ.startsAt);
      if (t <= nowMs && nowMs - t <= SEVENTY_TWO_HOURS_MS) return true;
      return false;
    },
    [classHasEnrollments],
  );

  const classAvailability = useMemo(() => {
    return new Map(orderedClasses.map((c) => [c.id, isClassUnlocked(c)]));
  }, [orderedClasses, isClassUnlocked]);

  const activeClass = orderedClasses.find((c) => c.id === activeClassId) ?? null;
  const classRoster = useMemo(() => {
    if (!activeClassId) return [];
    const ids = new Set(enrollments.filter((e) => e.classId === activeClassId).map((e) => e.studentId));
    return students.filter((s) => ids.has(s.id));
  }, [activeClassId, enrollments, students]);
  attendanceRef.current = attendance;

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
        parsedOcc ? sessionDateFromScheduleInstant(parsedOcc.startsAt) : initialSessionBundle.sessionDate,
      );
      const rosterIds = enrollments
        .filter((e) => e.classId === initialSessionBundle.classId)
        .map((e) => e.studentId);
      lastPersistedSnapshotRef.current = rosterAttendanceSnapshot(merged, rosterIds);
    }
  }, [initialSessionBundle, sessionIdFromQuery, mergeAttendanceWithRoster, enrollments]);

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
    if (!activeClassId || !sessionKey || !isSessionUuid(sessionKey) || !sessionDate) return false;
    const at = attendanceRef.current;
    const rows = classRoster.map((s) => ({
      studentId: s.id,
      status: at[s.id] ?? "present",
    }));
    const seq = ++saveSeq.current;
    setSaveUi("saving");
    setSaveMessage(null);
    const res = await saveAttendanceBundleAction({
      organizationId,
      classId: activeClassId,
      sessionId: sessionKey,
      occurrenceKey: occurrenceKey || null,
      sessionDate,
      rows,
    });
    if (seq !== saveSeq.current) return false;
    if (!res.ok) {
      setSaveUi("error");
      setSaveMessage(res.error);
      return false;
    }
    lastPersistedSnapshotRef.current = rosterAttendanceSnapshot(
      attendanceRef.current,
      classRoster.map((s) => s.id),
    );
    setSaveUi("saved");
    setTimeout(() => {
      setSaveUi((u) => (u === "saved" ? "idle" : u));
    }, 2500);
    router.refresh();
    return true;
  }, [organizationId, activeClassId, sessionKey, sessionDate, occurrenceKey, classRoster, router]);

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

  const startClassAttendance = (classId: string) => {
    const classRoom = orderedClasses.find((c) => c.id === classId);
    const occ = classRoom ? pickPrimaryAttendanceOccurrence(classRoom) : null;
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
    const sd = sessionDateFromScheduleInstant(occ.startsAt);
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
            <CardTitle className="text-base">Classes</CardTitle>
            <CardDescription>Ordered by next upcoming class date. Unlocks within 24h of next class or within 72h after.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {orderedClasses.length > 0 ? (
              orderedClasses.map((classRoom) => (
                <button
                  key={classRoom.id}
                  type="button"
                  disabled={!classAvailability.get(classRoom.id)}
                  onClick={() => startClassAttendance(classRoom.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left transition-colors",
                    classAvailability.get(classRoom.id) ? "hover:bg-accent/40" : "cursor-not-allowed opacity-60",
                  )}
                >
                  <div>
                    <p className="font-medium">{classRoom.name}</p>
                    <p className="text-sm text-muted-foreground">Next: {formatClassNextSessionLabel(classRoom)}</p>
                  </div>
                  <Badge variant="outline">
                    {classAvailability.get(classRoom.id) ? "Start attendance" : "Locked"}
                  </Badge>
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No classes available yet.</p>
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
