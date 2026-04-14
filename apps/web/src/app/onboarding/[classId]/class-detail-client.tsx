"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMonths, format } from "date-fns";
import { PaintBucket } from "lucide-react";
import {
  addClassTeacherAction,
  addEnrollmentAction,
  deleteClassAction,
  removeAllEnrollmentsForClassAction,
  removeClassTeacherAction,
  removeEnrollmentAction,
  upsertClassPayloadAction,
} from "@/app/actions/tracker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildAttendanceUrl } from "@/lib/attendance-utils";
import {
  addWeeklyRuleToClass,
  buildOccurrenceKey,
  getWeeklyRulesFromClass,
  isValidRepeatUntilDate,
  isValidWeeklyTimeLocal,
  makeSlotId,
  makeWeeklyRuleId,
  normalizeClassForRead,
  pickPrimaryAttendanceOccurrence,
  removeWeeklyRuleFromClass,
  sessionDateFromScheduleInstant,
  withScheduleSlots,
} from "@/lib/class-schedule";
import { touchClassAccess } from "@/lib/classes-storage";
import { formatClassGradesLong, formatClassGradesShort } from "@/lib/tracker-constants";
import type {
  ClassAttendanceSlotRow,
  ClassTeacherRosterEntry,
  TeacherPickOption,
} from "@/lib/tracker-queries";
import type { ClassRoom, Student, StudentClassEnrollment, WeeklyRepeatRule } from "@/lib/tracker-types";
import { cn } from "@/lib/utils";

const BOX_THEMES = [
  { id: "default", label: "Default", cardClass: "bg-card", swatchClass: "bg-zinc-300" },
  { id: "blue", label: "Blue", cardClass: "bg-blue-50/70 dark:bg-blue-950/30", swatchClass: "bg-blue-400" },
  { id: "green", label: "Green", cardClass: "bg-emerald-50/70 dark:bg-emerald-950/30", swatchClass: "bg-emerald-400" },
  { id: "purple", label: "Purple", cardClass: "bg-violet-50/70 dark:bg-violet-950/30", swatchClass: "bg-violet-400" },
] as const;

const WEEKDAY_TOGGLE = [
  { day: 0, label: "Sun" },
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
] as const;

export type ClassDetailClientProps = {
  organizationId: string;
  /** IANA zone for weekly times and session dates (from organization settings). */
  scheduleTimeZone: string;
  classId: string;
  initialClassRoom: ClassRoom;
  initialStudents: Student[];
  initialEnrollments: StudentClassEnrollment[];
  initialAttendanceSlots: ClassAttendanceSlotRow[];
  initialTeacherPanel: {
    roster: ClassTeacherRosterEntry[];
    addCandidates: TeacherPickOption[];
    canManage: boolean;
    viewerMayDeleteClass: boolean;
  };
};

export function ClassDetailClient({
  organizationId,
  scheduleTimeZone,
  classId,
  initialClassRoom,
  initialStudents,
  initialEnrollments,
  initialAttendanceSlots,
  initialTeacherPanel,
}: ClassDetailClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [boxTheme, setBoxTheme] = useState<(typeof BOX_THEMES)[number]["id"]>("default");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rawClassState, setRawClassState] = useState<ClassRoom>(initialClassRoom);
  const [students, setStudents] = useState<Student[]>(initialStudents);
  const [enrollments, setEnrollments] = useState<StudentClassEnrollment[]>(initialEnrollments);
  const [attendanceSlots, setAttendanceSlots] = useState<ClassAttendanceSlotRow[]>(initialAttendanceSlots);
  const [addMode, setAddMode] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [studentFilter, setStudentFilter] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [pendingRemoveIds, setPendingRemoveIds] = useState<string[]>([]);
  const [newSlotLocal, setNewSlotLocal] = useState("");
  const [draftWeekdays, setDraftWeekdays] = useState<number[]>([]);
  const [draftTime, setDraftTime] = useState("14:00");
  const [draftUntil, setDraftUntil] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [teacherPanel, setTeacherPanel] = useState(initialTeacherPanel);
  const [pickTeacherId, setPickTeacherId] = useState("");

  const rawClass = rawClassState.id === classId ? rawClassState : null;
  const classRoom = useMemo(() => (rawClass ? normalizeClassForRead(rawClass) : null), [rawClass]);
  const savedWeeklyRules = useMemo(() => (rawClass ? getWeeklyRulesFromClass(rawClass) : []), [rawClass]);
  const slotLabelFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }),
    [],
  );
  const timeOnlyFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }),
    [],
  );
  const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  const formatWeeklyRuleSummary = (rule: WeeklyRepeatRule) => {
    const days = rule.weekdays.map((i) => weekdayShort[i] ?? "?").join(", ");
    const [hh, mm] = rule.timeLocal.split(":").map((x) => parseInt(x, 10));
    const ref = new Date(2000, 0, 1, hh || 0, mm || 0, 0, 0);
    const from = rule.repeatFrom?.trim();
    const fromPart = from && isValidRepeatUntilDate(from) ? ` · from ${from}` : "";
    return `${days} · ${timeOnlyFormatter.format(ref)}${fromPart} · until ${rule.repeatUntil}`;
  };
  const roster = useMemo(() => {
    const ids = new Set(enrollments.filter((row) => row.classId === classId).map((row) => row.studentId));
    return students.filter((student) => ids.has(student.id));
  }, [classId, enrollments, students]);
  const availableStudents = useMemo(() => {
    const rosterIds = new Set(roster.map((student) => student.id));
    const query = studentFilter.trim().toLowerCase();
    return students.filter((student) => {
      if (rosterIds.has(student.id)) return false;
      if (!query) return true;
      return student.fullName.toLowerCase().includes(query);
    });
  }, [roster, studentFilter, students]);

  useEffect(() => {
    setRawClassState(initialClassRoom);
    setStudents(initialStudents);
    setEnrollments(initialEnrollments);
    setAttendanceSlots(initialAttendanceSlots);
    const saved = window.localStorage.getItem(`class-box-theme:${classId}`);
    if (BOX_THEMES.some((theme) => theme.id === saved)) {
      setBoxTheme(saved as (typeof BOX_THEMES)[number]["id"]);
    } else {
      setBoxTheme("default");
    }
  }, [classId, initialClassRoom, initialStudents, initialEnrollments, initialAttendanceSlots]);

  useEffect(() => {
    setTeacherPanel(initialTeacherPanel);
  }, [initialTeacherPanel]);

  useEffect(() => {
    setDraftWeekdays([]);
    setDraftTime("14:00");
    const today = format(new Date(), "yyyy-MM-dd");
    setDraftFrom(today);
    setDraftUntil(format(addMonths(new Date(), 3), "yyyy-MM-dd"));
  }, [classId]);

  useEffect(() => {
    if (classRoom) {
      touchClassAccess(classId);
    }
  }, [classId, classRoom]);

  if (!classRoom || !rawClass) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Class not found</h1>
        <p className="text-sm text-muted-foreground">This class may have been deleted or is unavailable.</p>
        <Link href="/onboarding" className="text-sm text-primary underline-offset-4 hover:underline">
          Back to classes
        </Link>
      </main>
    );
  }

  const attendanceReturnTo = `/onboarding/${classId}`;

  const startAttendanceSession = () => {
    const occ = pickPrimaryAttendanceOccurrence(classRoom, { scheduleTimeZone });
    if (!occ) return;
    const key = buildOccurrenceKey(occ.classId, occ.slotId, occ.startsAt);
    const sessionDate = sessionDateFromScheduleInstant(occ.startsAt, scheduleTimeZone);
    router.push(
      buildAttendanceUrl({
        classId,
        occurrenceKey: key,
        sessionDate,
        returnTo: attendanceReturnTo,
      }),
    );
  };
  const selectedTheme = BOX_THEMES.find((theme) => theme.id === boxTheme) ?? BOX_THEMES[0];
  const boxCardClass = selectedTheme.cardClass;

  const updateBoxTheme = (nextTheme: (typeof BOX_THEMES)[number]["id"]) => {
    setBoxTheme(nextTheme);
    window.localStorage.setItem(`class-box-theme:${classId}`, nextTheme);
    setPickerOpen(false);
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId],
    );
  };

  const addSelectedStudents = () => {
    if (selectedStudentIds.length === 0) {
      setAddMode(false);
      return;
    }
    const ids = [...selectedStudentIds];
    startTransition(async () => {
      for (const studentId of ids) {
        const result = await addEnrollmentAction(organizationId, classId, studentId);
        if (!result.ok) {
          window.alert(result.error);
          return;
        }
      }
      setSelectedStudentIds([]);
      setStudentFilter("");
      setAddMode(false);
      router.refresh();
    });
  };

  const togglePendingRemoval = (studentId: string) => {
    setPendingRemoveIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId],
    );
  };

  const confirmRemoval = () => {
    if (pendingRemoveIds.length === 0) {
      setRemoveMode(false);
      return;
    }
    const ids = [...pendingRemoveIds];
    startTransition(async () => {
      for (const studentId of ids) {
        const result = await removeEnrollmentAction(organizationId, classId, studentId);
        if (!result.ok) {
          window.alert(result.error);
          return;
        }
      }
      setPendingRemoveIds([]);
      setRemoveMode(false);
      router.refresh();
    });
  };

  const removeAllStudents = () => {
    startTransition(async () => {
      const result = await removeAllEnrollmentsForClassAction(organizationId, classId);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      setPendingRemoveIds([]);
      setRemoveMode(false);
      router.refresh();
    });
  };

  const persistClassToStorage = (updatedClass: ClassRoom) => {
    setRawClassState(updatedClass);
    startTransition(async () => {
      const result = await upsertClassPayloadAction(organizationId, updatedClass);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  };

  const addScheduleSlot = () => {
    if (!classRoom || !newSlotLocal.trim()) return;
    const parsed = new Date(newSlotLocal);
    if (Number.isNaN(parsed.getTime())) return;
    const nextSlots = [...(classRoom.scheduleSlots ?? []), { id: makeSlotId(), startsAt: parsed.toISOString() }];
    persistClassToStorage(withScheduleSlots(classRoom, nextSlots, scheduleTimeZone));
    setNewSlotLocal("");
  };

  const removeScheduleSlot = (slotId: string) => {
    if (!classRoom) return;
    const nextSlots = (classRoom.scheduleSlots ?? []).filter((slot) => slot.id !== slotId);
    persistClassToStorage(withScheduleSlots(classRoom, nextSlots, scheduleTimeZone));
  };

  const toggleDraftWeekday = (day: number) => {
    setDraftWeekdays((prev) => {
      if (prev.includes(day)) return prev.filter((d) => d !== day);
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const saveRecurringPattern = () => {
    const weekdays = [...draftWeekdays].sort((a, b) => a - b);
    if (weekdays.length === 0) return;
    if (!isValidRepeatUntilDate(draftUntil) || !isValidRepeatUntilDate(draftFrom) || !isValidWeeklyTimeLocal(draftTime))
      return;
    if (draftFrom.trim() > draftUntil.trim()) return;
    const rule: WeeklyRepeatRule = {
      id: makeWeeklyRuleId(),
      weekdays,
      timeLocal: draftTime.trim(),
      repeatFrom: draftFrom.trim(),
      repeatUntil: draftUntil.trim(),
    };
    persistClassToStorage(addWeeklyRuleToClass(rawClassState, rule, scheduleTimeZone));
    setDraftWeekdays([]);
  };

  const removeRecurringRule = (ruleId: string) => {
    persistClassToStorage(removeWeeklyRuleFromClass(rawClassState, ruleId, scheduleTimeZone));
  };

  const deleteClass = () => {
    const confirmed = window.confirm(`Delete class "${classRoom.name}"? This will remove class roster data.`);
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteClassAction(organizationId, classId);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      window.localStorage.removeItem(`class-box-theme:${classId}`);
      router.push("/onboarding");
      router.refresh();
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{classRoom.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatClassGradesLong(classRoom.grades)} · CEFR {classRoom.cefrLevel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Join code: {classRoom.joinCode}</Badge>
          {teacherPanel.viewerMayDeleteClass ? (
            <Button type="button" size="sm" variant="destructive" onClick={deleteClass}>
              Delete class
            </Button>
          ) : null}
        </div>
      </div>

      <section>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className={cn(boxCardClass)}>
            <CardContent className="p-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Roster</p>
              <p className="mt-0.5 text-lg font-semibold">{roster.length}</p>
            </CardContent>
          </Card>
          <Card className={cn(boxCardClass)}>
            <CardContent className="p-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Grades</p>
              <p className="mt-0.5 text-lg font-semibold leading-snug">{formatClassGradesShort(classRoom.grades)}</p>
            </CardContent>
          </Card>
          <Card className={cn("relative", boxCardClass)}>
            <CardContent className="p-2.5">
              <div className="absolute top-2 right-2">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Open color selector"
                  title="Change info box color"
                  onClick={() => setPickerOpen((v) => !v)}
                >
                  <PaintBucket className="size-3.5" />
                </Button>
                {pickerOpen ? (
                  <div className="absolute top-8 right-0 z-10 rounded-md border border-border bg-background p-2 shadow-md">
                    <div className="flex items-center gap-1.5">
                      {BOX_THEMES.map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          aria-label={`Use ${theme.label} color`}
                          title={theme.label}
                          onClick={() => updateBoxTheme(theme.id)}
                          className={cn(
                            "size-5 rounded-full border border-border",
                            theme.swatchClass,
                            boxTheme === theme.id && "ring-2 ring-primary",
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">CEFR</p>
              <p className="mt-0.5 text-lg font-semibold">{classRoom.cefrLevel}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-base">Teachers</CardTitle>
          <CardDescription>
            Lead instructor and co-teachers from your organization. Co-teachers see this class in their schedule and
            attendance lists. Only the organization owner or the lead instructor can add or remove co-teachers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2 text-sm">
            {teacherPanel.roster.map((row) => (
              <li
                key={row.profileId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2"
              >
                <span>
                  {row.fullName}
                  {row.isPrimary ? (
                    <Badge variant="secondary" className="ml-2">
                      Lead
                    </Badge>
                  ) : null}
                </span>
                {teacherPanel.canManage && !row.isPrimary ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      startTransition(async () => {
                        const res = await removeClassTeacherAction(organizationId, classId, row.profileId);
                        if (!res.ok) {
                          window.alert(res.error);
                          return;
                        }
                        router.refresh();
                      });
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {teacherPanel.canManage && teacherPanel.addCandidates.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
                <label htmlFor="add-co-teacher" className="text-xs font-medium text-muted-foreground">
                  Add co-teacher
                </label>
                <select
                  id="add-co-teacher"
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={pickTeacherId}
                  onChange={(e) => setPickTeacherId(e.target.value)}
                >
                  <option value="">Select a teacher…</option>
                  {teacherPanel.addCandidates.map((opt) => (
                    <option key={opt.profileId} value={opt.profileId}>
                      {opt.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!pickTeacherId}
                onClick={() => {
                  const pid = pickTeacherId;
                  if (!pid) return;
                  startTransition(async () => {
                    const res = await addClassTeacherAction(organizationId, classId, pid);
                    if (!res.ok) {
                      window.alert(res.error);
                      return;
                    }
                    setPickTeacherId("");
                    router.refresh();
                  });
                }}
              >
                Add
              </Button>
            </div>
          ) : null}
          {!teacherPanel.canManage ? (
            <p className="text-xs text-muted-foreground">Ask the lead instructor or owner to assign co-teachers.</p>
          ) : null}
          {teacherPanel.canManage && teacherPanel.addCandidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">All organization teachers are already on this class.</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid w-full max-w-4xl gap-4 md:grid-cols-2">
        <Card className="w-full border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardHeader>
            <CardTitle className="text-base">Session attendance</CardTitle>
            <CardDescription>Start from the next scheduled slot for this class.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              size="lg"
              className="h-12 w-full max-w-[240px] bg-emerald-600 px-6 text-base text-white hover:bg-emerald-700"
              onClick={startAttendanceSession}
            >
              Take attendance
            </Button>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">Scheduled sessions</CardTitle>
            <CardDescription>
              Past meetings from this class schedule. Open a finalized session to view it (read-only), or catch up when
              attendance is still a draft.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[min(24rem,55vh)] space-y-2 overflow-y-auto pr-1">
            {attendanceSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add schedule slots or recurring patterns to see sessions here.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {attendanceSlots.map((slot) => {
                  const statusLabel = slot.attendanceFinalized
                    ? "Finalized"
                    : slot.sessionId
                      ? "Draft"
                      : "Not recorded";
                  const canCatchUp = !slot.attendanceFinalized;
                  const viewHref = slot.sessionId
                    ? buildAttendanceUrl({
                        classId,
                        sessionId: slot.sessionId,
                        returnTo: attendanceReturnTo,
                      })
                    : null;
                  return (
                    <li key={slot.occurrenceKey}>
                      {slot.attendanceFinalized && viewHref ? (
                        <Link
                          href={viewHref}
                          className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2 transition-colors hover:bg-accent/40"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">{slotLabelFormatter.format(new Date(slot.startsAt))}</span>
                            <Badge variant="default">{statusLabel}</Badge>
                          </div>
                          <span className="text-xs font-medium text-primary">View attendance (read-only)</span>
                        </Link>
                      ) : slot.attendanceFinalized ? (
                        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">{slotLabelFormatter.format(new Date(slot.startsAt))}</span>
                            <Badge variant="default">{statusLabel}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">No saved session id for this row.</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">{slotLabelFormatter.format(new Date(slot.startsAt))}</span>
                            <Badge variant={slot.sessionId ? "secondary" : "outline"}>{statusLabel}</Badge>
                          </div>
                          {canCatchUp ? (
                            <Link
                              href={buildAttendanceUrl({
                                classId,
                                occurrenceKey: slot.occurrenceKey,
                                sessionDate: slot.sessionDate,
                                returnTo: attendanceReturnTo,
                              })}
                              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                            >
                              Take or continue attendance
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">No session saved for this slot yet.</span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Class schedule</CardTitle>
          <CardDescription>
            One-off slots and recurring patterns (possibly different days and times) all appear on the Schedule calendar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">Recurring weekly patterns</p>
            <p className="text-xs text-muted-foreground">
              Add each pattern separately (for example Saturday 2:00 PM and Sunday 7:30 PM). Set the first day this
              pattern applies and an end date, then click Save. Nothing is stored until you save.
            </p>
            {savedWeeklyRules.length > 0 ? (
              <ul className="space-y-2">
                {savedWeeklyRules.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <span>{formatWeeklyRuleSummary(rule)}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => removeRecurringRule(rule.id)}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No saved recurring patterns yet.</p>
            )}
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Add pattern</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_TOGGLE.map(({ day, label }) => (
                  <label
                    key={day}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium shadow-xs hover:bg-accent/50"
                  >
                    <input
                      type="checkbox"
                      checked={draftWeekdays.includes(day)}
                      onChange={() => toggleDraftWeekday(day)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="draft-weekly-time" className="text-xs font-medium text-muted-foreground">
                    Time (local)
                  </label>
                  <input
                    id="draft-weekly-time"
                    type="time"
                    value={draftTime}
                    onChange={(event) => setDraftTime(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="draft-pattern-starts" className="text-xs font-medium text-muted-foreground">
                    Pattern starts
                  </label>
                  <input
                    id="draft-pattern-starts"
                    type="date"
                    value={draftFrom}
                    onChange={(event) => setDraftFrom(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="draft-repeat-until" className="text-xs font-medium text-muted-foreground">
                    Repeat until
                  </label>
                  <input
                    id="draft-repeat-until"
                    type="date"
                    value={draftUntil}
                    onChange={(event) => setDraftUntil(event.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={saveRecurringPattern}
                  disabled={
                    draftWeekdays.length === 0 ||
                    !isValidRepeatUntilDate(draftUntil) ||
                    !isValidRepeatUntilDate(draftFrom) ||
                    !isValidWeeklyTimeLocal(draftTime) ||
                    draftFrom.trim() > draftUntil.trim()
                  }
                >
                  Save pattern
                </Button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-[200px] flex-1 flex-col gap-1">
              <label htmlFor="new-slot-local" className="text-xs font-medium text-muted-foreground">
                Date and time
              </label>
              <input
                id="new-slot-local"
                type="datetime-local"
                value={newSlotLocal}
                onChange={(event) => setNewSlotLocal(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
            <Button type="button" size="sm" onClick={addScheduleSlot} disabled={!newSlotLocal.trim()}>
              Add slot
            </Button>
          </div>
          {(classRoom.scheduleSlots ?? []).length > 0 ? (
            <ul className="space-y-2">
              {[...(classRoom.scheduleSlots ?? [])]
                .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
                .map((slot) => (
                  <li
                    key={slot.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="text-sm">{slotLabelFormatter.format(new Date(slot.startsAt))}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => removeScheduleSlot(slot.id)}>
                      Remove
                    </Button>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No scheduled slots yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Class roster</CardTitle>
          <CardDescription>Students currently enrolled in this class.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={addMode ? "secondary" : "default"}
              onClick={() => {
                setAddMode((v) => !v);
                setRemoveMode(false);
                setPendingRemoveIds([]);
              }}
            >
              Add students
            </Button>
            <Button
              type="button"
              size="sm"
              variant={removeMode ? "destructive" : "outline"}
              onClick={() => {
                setRemoveMode((v) => !v);
                setAddMode(false);
                setSelectedStudentIds([]);
                if (removeMode) setPendingRemoveIds([]);
              }}
            >
              Remove students
            </Button>
            {removeMode ? (
              <>
                <Button type="button" size="sm" variant="destructive" onClick={removeAllStudents}>
                  Remove all students
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={confirmRemoval}>
                  Confirm removal
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRemoveMode(false);
                    setPendingRemoveIds([]);
                  }}
                >
                  Cancel
                </Button>
              </>
            ) : null}
          </div>

          {addMode ? (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  value={studentFilter}
                  onChange={(event) => setStudentFilter(event.target.value)}
                  placeholder="Filter students..."
                  className="h-8 min-w-[220px] rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                <Button type="button" size="sm" onClick={addSelectedStudents}>
                  Add selected
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAddMode(false);
                    setSelectedStudentIds([]);
                    setStudentFilter("");
                  }}
                >
                  Cancel
                </Button>
              </div>
              <div className="space-y-1">
                {availableStudents.length > 0 ? (
                  availableStudents.map((student) => (
                    <label key={student.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(student.id)}
                        onChange={() => toggleStudentSelection(student.id)}
                      />
                      <span className="text-sm">{student.fullName}</span>
                      <span className="text-xs text-muted-foreground">{student.level}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No matching students available to add.</p>
                )}
              </div>
            </div>
          ) : null}

          {roster.length > 0 ? (
            roster.map((student) => (
              <div
                key={student.id}
                className={cn(
                  "flex items-center justify-between rounded-lg border border-border px-3 py-2",
                  removeMode && "border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20",
                )}
              >
                <div>
                  <p className="font-medium">{student.fullName}</p>
                  <p className="text-sm text-muted-foreground">{student.level}</p>
                </div>
                <div className="flex items-center gap-2">
                  {removeMode ? (
                    <button
                      type="button"
                      aria-label={`Mark ${student.fullName} for removal`}
                      onClick={() => togglePendingRemoval(student.id)}
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full border text-sm font-semibold",
                        pendingRemoveIds.includes(student.id)
                          ? "border-red-700 bg-red-600 text-white"
                          : "border-red-500 text-red-600",
                      )}
                    >
                      ×
                    </button>
                  ) : null}
                  <Badge variant="outline">{student.avatar}</Badge>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
          )}
        </CardContent>
      </Card>

      <Link href="/onboarding" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to classes
      </Link>
    </main>
  );
}
