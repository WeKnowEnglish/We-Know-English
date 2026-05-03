import { addDays, endOfDay, format, subDays } from "date-fns";
import { fetchOrgMembershipRole } from "@/lib/organization-server";
import { getScheduleTimezoneForOrganization } from "@/lib/organization-schedule-timezone";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildOccurrenceKey,
  classHasDefinedSchedule,
  embeddedCalendarDayFromOccurrenceKey,
  getScheduleEvents,
  parseOccurrenceKey,
  sessionDateFromScheduleInstant,
} from "@/lib/class-schedule";
import { normalizeAttendanceStatus } from "@/lib/attendance-utils";
import {
  classRowToClassRoom,
  enrollmentRowToEnrollment,
  studentRowToStudent,
} from "@/lib/tracker-mappers";
import type { AttendanceStatus, ClassFeedPost, ClassRoom, Student, StudentClassEnrollment } from "@/lib/tracker-types";

export async function verifyOrgMembership(userId: string, organizationId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("organization_members")
    .select("id")
    .eq("profile_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return Boolean(data);
}

/** When set, staff only see classes they lead or are assigned to as co-teachers; owners see all. */
export type TeacherClassAccess = {
  userId: string;
  orgRole: "owner" | "staff" | "client";
};

/** When callers already loaded classes + enrollments, pass through to avoid duplicate queries. */
export type AttendanceSchedulePreload = {
  classes: ClassRoom[];
  enrollments: StudentClassEnrollment[];
};

/** Build access for `fetchClassesForOrg` from org membership (owners and staff get scoped lists). */
export function teacherAccessFromMembership(
  userId: string,
  orgRole: "owner" | "staff" | "client" | null,
): TeacherClassAccess | null {
  if (!orgRole) return null;
  return { userId, orgRole };
}

export async function resolveTeacherClassAccess(
  userId: string,
  organizationId: string,
): Promise<TeacherClassAccess | null> {
  const role = await fetchOrgMembershipRole(userId, organizationId);
  return teacherAccessFromMembership(userId, role);
}

export async function teacherHasAccessToClass(
  organizationId: string,
  userId: string,
  orgRole: TeacherClassAccess["orgRole"] | null,
  classId: string,
): Promise<boolean> {
  if (orgRole === "owner") return true;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;
  const { data: cls, error } = await supabase
    .from("classes")
    .select("id, tutor_id")
    .eq("organization_id", organizationId)
    .eq("id", classId)
    .maybeSingle();
  if (error || !cls) return false;
  const tutorId = (cls as { tutor_id: string | null }).tutor_id;
  if (tutorId === userId) return true;
  const { data: link } = await supabase
    .from("class_teachers")
    .select("id")
    .eq("class_id", classId)
    .eq("profile_id", userId)
    .maybeSingle();
  return Boolean(link);
}

export async function fetchClassesForOrg(
  organizationId: string,
  access: TeacherClassAccess | null = null,
): Promise<ClassRoom[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from("classes")
    .select("id, name, created_at, settings")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (access && (access.orgRole === "staff" || access.orgRole === "client")) {
    const allowedClassIds = await fetchAssignedClassIdsForTeacher(organizationId, access.userId);
    if (allowedClassIds.length === 0) return [];
    query = query.in("id", allowedClassIds);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => classRowToClassRoom(row as Parameters<typeof classRowToClassRoom>[0]));
}

export async function fetchAssignedClassIdsForTeacher(organizationId: string, userId: string): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];
  const [leadClasses, coTeacherClasses] = await Promise.all([
    supabase.from("classes").select("id").eq("organization_id", organizationId).eq("tutor_id", userId),
    supabase
      .from("class_teachers")
      .select("class_id")
      .eq("organization_id", organizationId)
      .eq("profile_id", userId),
  ]);
  const out = new Set<string>();
  for (const row of (leadClasses.data ?? []) as { id: string }[]) out.add(row.id);
  for (const row of (coTeacherClasses.data ?? []) as { class_id: string }[]) out.add(row.class_id);
  return [...out];
}

export async function fetchStudentsForOrg(organizationId: string, studentIds?: string[] | null): Promise<Student[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];
  if (studentIds && studentIds.length === 0) return [];
  let query = supabase
    .from("students")
    .select("id, full_name, level, email, birthdate, skills_points, linked_user_id, profile")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (studentIds && studentIds.length > 0) {
    query = query.in("id", studentIds);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => studentRowToStudent(row as Parameters<typeof studentRowToStudent>[0]));
}

export async function fetchEnrollmentsForOrg(
  organizationId: string,
  classIds?: string[] | null,
): Promise<StudentClassEnrollment[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];
  if (classIds && classIds.length === 0) return [];
  let query = supabase.from("enrollments").select("student_id, class_id, created_at").eq("organization_id", organizationId);
  if (classIds && classIds.length > 0) {
    query = query.in("class_id", classIds);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => enrollmentRowToEnrollment(row as Parameters<typeof enrollmentRowToEnrollment>[0]));
}

export async function fetchClassById(organizationId: string, classId: string): Promise<ClassRoom | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("classes")
    .select("id, name, created_at, settings")
    .eq("organization_id", organizationId)
    .eq("id", classId)
    .maybeSingle();
  if (error || !data) return null;
  return classRowToClassRoom(data as Parameters<typeof classRowToClassRoom>[0]);
}

export type ClassTeacherRosterEntry = {
  profileId: string;
  fullName: string;
  isPrimary: boolean;
  classRole: "lead" | "co_teacher" | "assistant";
};

export type TeacherPickOption = {
  profileId: string;
  fullName: string;
  orgRole: "owner" | "staff";
};

export async function fetchClassTeacherPanelData(
  organizationId: string,
  classId: string,
  viewer: { userId: string; orgRole: TeacherClassAccess["orgRole"] },
): Promise<{
  roster: ClassTeacherRosterEntry[];
  addCandidates: TeacherPickOption[];
  canManage: boolean;
  /** Owner or lead instructor — may delete the class. */
  viewerMayDeleteClass: boolean;
}> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { roster: [], addCandidates: [], canManage: false, viewerMayDeleteClass: false };
  }

  const { data: cls, error: clsErr } = await supabase
    .from("classes")
    .select("tutor_id")
    .eq("organization_id", organizationId)
    .eq("id", classId)
    .maybeSingle();
  if (clsErr || !cls) {
    return { roster: [], addCandidates: [], canManage: false, viewerMayDeleteClass: false };
  }
  const tutorId = (cls as { tutor_id: string | null }).tutor_id;

  const { data: tutorProf } = tutorId
    ? await supabase.from("profiles").select("id, full_name").eq("id", tutorId).maybeSingle()
    : { data: null };
  const tutorName = (tutorProf as { full_name: string } | null)?.full_name ?? "Lead instructor";

  const { data: ctRows } = await supabase
    .from("class_teachers")
    .select("profile_id, role, profiles(full_name)")
    .eq("organization_id", organizationId)
    .eq("class_id", classId);

  const rosterMap = new Map<string, ClassTeacherRosterEntry>();
  if (tutorId) {
    rosterMap.set(tutorId, { profileId: tutorId, fullName: tutorName, isPrimary: true, classRole: "lead" });
  }
  for (const raw of ctRows ?? []) {
    const row = raw as {
      profile_id: string;
      role: string | null;
      profiles: { full_name: string } | { full_name: string }[] | null;
    };
    const p = row.profiles;
    const name = p && !Array.isArray(p) ? p.full_name : Array.isArray(p) && p[0] ? p[0].full_name : "Teacher";
    const isPrimary = row.profile_id === tutorId;
    const classRole = row.role === "assistant" ? "assistant" : "co_teacher";
    rosterMap.set(row.profile_id, {
      profileId: row.profile_id,
      fullName: name,
      isPrimary,
      classRole: isPrimary ? "lead" : classRole,
    });
  }

  const roster = [...rosterMap.values()].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.fullName.localeCompare(b.fullName);
  });

  const assigned = new Set(roster.map((r) => r.profileId));

  const { data: members } = await supabase
    .from("organization_members")
    .select("profile_id, role, profiles(full_name)")
    .eq("organization_id", organizationId);

  const addCandidates: TeacherPickOption[] = [];
  for (const raw of members ?? []) {
    const row = raw as {
      profile_id: string;
      role: string;
      profiles: { full_name: string } | { full_name: string }[] | null;
    };
    const p = row.profiles;
    const pr = p && !Array.isArray(p) ? p : Array.isArray(p) ? p[0] : null;
    if (!pr) continue;
    if (row.role !== "owner" && row.role !== "staff") continue;
    if (assigned.has(row.profile_id)) continue;
    addCandidates.push({ profileId: row.profile_id, fullName: pr.full_name, orgRole: row.role });
  }
  addCandidates.sort((a, b) => a.fullName.localeCompare(b.fullName));

  const viewerClassRole = rosterMap.get(viewer.userId)?.classRole ?? null;
  const canManage =
    viewer.orgRole === "owner" || (tutorId !== null && tutorId === viewer.userId) || viewerClassRole === "co_teacher";

  const viewerMayDeleteClass =
    viewer.orgRole === "owner" || (tutorId !== null && tutorId === viewer.userId);

  return { roster, addCandidates, canManage, viewerMayDeleteClass };
}

export async function fetchStudentById(organizationId: string, studentId: string): Promise<Student | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("students")
    .select("id, full_name, level, email, birthdate, skills_points, linked_user_id, profile")
    .eq("organization_id", organizationId)
    .eq("id", studentId)
    .maybeSingle();
  if (error || !data) return null;
  return studentRowToStudent(data as Parameters<typeof studentRowToStudent>[0]);
}

/** Classes the signed-in user is enrolled in as a linked student (RLS-scoped). */
export type StudentEnrollmentClassSummary = {
  classId: string;
  className: string;
  organizationId: string;
  joinedAt: string;
};

export async function fetchStudentEnrollmentClasses(): Promise<StudentEnrollmentClassSummary[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("enrollments")
    .select("class_id, organization_id, created_at, classes(name)")
    .order("created_at", { ascending: false });

  if (error || !data?.length) return [];

  const out: StudentEnrollmentClassSummary[] = [];
  for (const row of data as {
    class_id: string;
    organization_id: string;
    created_at: string;
    classes: { name: string } | { name: string }[] | null;
  }[]) {
    const cls = row.classes;
    const name =
      cls && !Array.isArray(cls)
        ? cls.name
        : Array.isArray(cls) && cls[0]
          ? cls[0].name
          : "Class";
    out.push({
      classId: row.class_id,
      className: name,
      organizationId: row.organization_id,
      joinedAt: row.created_at,
    });
  }
  return out;
}

export type AttendanceSessionBundle = {
  sessionId: string;
  classId: string;
  sessionDate: string;
  occurrenceKey: string | null;
  finalized: boolean;
  attendance: Record<string, AttendanceStatus>;
};

export async function fetchAttendanceSessionBundle(
  organizationId: string,
  sessionId: string,
): Promise<AttendanceSessionBundle | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data: session, error: se } = await supabase
    .from("sessions")
    .select("id, class_id, session_date, occurrence_key, attendance_finalized")
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();
  if (se || !session) return null;
  const row = session as {
    id: string;
    class_id: string;
    session_date: string;
    occurrence_key: string | null;
    attendance_finalized: boolean;
  };
  const { data: recs } = await supabase.from("attendance_records").select("student_id, status").eq("session_id", row.id);
  const attendance: Record<string, AttendanceStatus> = {};
  for (const r of recs ?? []) {
    const rec = r as { student_id: string; status: string };
    attendance[rec.student_id] = normalizeAttendanceStatus(rec.status);
  }
  return {
    sessionId: row.id,
    classId: row.class_id,
    sessionDate: String(row.session_date).slice(0, 10),
    occurrenceKey: row.occurrence_key,
    finalized: row.attendance_finalized,
    attendance,
  };
}

/** Distinct finalized sessions where at least one attendance row was last saved by this profile. */
export type FinalizedSessionMarkedByMeRow = {
  sessionId: string;
  classId: string;
  className: string;
  sessionDate: string;
  recordsMarked: number;
};

export async function fetchFinalizedSessionsMarkedByProfile(
  organizationId: string,
  profileId: string,
): Promise<FinalizedSessionMarkedByMeRow[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  type SessionEmbed = {
    id: string;
    session_date: string;
    attendance_finalized: boolean;
    class_id: string;
    classes: { name: string } | { name: string }[] | null;
  };
  type Rec = { session_id: string; sessions: SessionEmbed | SessionEmbed[] | null };

  const accum: Rec[] = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("attendance_records")
      .select("session_id, sessions(id, session_date, attendance_finalized, class_id, classes(name))")
      .eq("organization_id", organizationId)
      .eq("marked_by", profileId)
      .order("session_id", { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) break;
    if (!data?.length) break;
    accum.push(...(data as Rec[]));
    if (data.length < pageSize) break;
  }

  type SessionRow = {
    id: string;
    session_date: string;
    attendance_finalized: boolean;
    class_id: string;
    classes: { name: string } | { name: string }[] | null;
  };
  const finalizedByMeSessions: SessionRow[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("sessions")
      .select("id, session_date, attendance_finalized, class_id, classes(name)")
      .eq("organization_id", organizationId)
      .eq("attendance_finalized", true)
      .eq("attendance_finalized_by", profileId)
      .order("session_date", { ascending: false })
      .range(start, start + pageSize - 1);
    if (error) break;
    if (!data?.length) break;
    finalizedByMeSessions.push(...(data as SessionRow[]));
    if (data.length < pageSize) break;
  }

  const merged = new Map<string, FinalizedSessionMarkedByMeRow>();
  for (const r of accum) {
    const sRaw = r.sessions;
    const s = Array.isArray(sRaw) ? sRaw[0] : sRaw;
    if (!s || !s.attendance_finalized) continue;
    const cls = s.classes;
    const className =
      cls && !Array.isArray(cls) ? cls.name : Array.isArray(cls) && cls[0] ? cls[0].name : "Class";
    const sessionDate = String(s.session_date).slice(0, 10);
    const sid = r.session_id;
    const prev = merged.get(sid);
    if (prev) merged.set(sid, { ...prev, recordsMarked: prev.recordsMarked + 1 });
    else
      merged.set(sid, {
        sessionId: sid,
        classId: s.class_id,
        className,
        sessionDate,
        recordsMarked: 1,
      });
  }

  const finalizedIds = finalizedByMeSessions.map((s) => s.id);
  const myMarkedBySession = new Map<string, number>();
  const idChunkSize = 200;
  for (let c = 0; c < finalizedIds.length; c += idChunkSize) {
    const idChunk = finalizedIds.slice(c, c + idChunkSize);
    if (idChunk.length === 0) continue;
    for (let start = 0; ; start += pageSize) {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("session_id")
        .eq("organization_id", organizationId)
        .eq("marked_by", profileId)
        .in("session_id", idChunk)
        .order("session_id", { ascending: true })
        .range(start, start + pageSize - 1);
      if (error) break;
      if (!data?.length) break;
      for (const row of data as { session_id: string }[]) {
        const sid = row.session_id;
        myMarkedBySession.set(sid, (myMarkedBySession.get(sid) ?? 0) + 1);
      }
      if (data.length < pageSize) break;
    }
  }

  for (const s of finalizedByMeSessions) {
    if (!s.attendance_finalized) continue;
    const cls = s.classes;
    const className =
      cls && !Array.isArray(cls) ? cls.name : Array.isArray(cls) && cls[0] ? cls[0].name : "Class";
    const sessionDate = String(s.session_date).slice(0, 10);
    const sid = s.id;
    const prev = merged.get(sid);
    const markedCount = myMarkedBySession.get(sid) ?? 0;
    if (prev) {
      merged.set(sid, {
        ...prev,
        recordsMarked: Math.max(prev.recordsMarked, markedCount),
      });
      continue;
    }
    merged.set(sid, {
      sessionId: sid,
      classId: s.class_id,
      className,
      sessionDate,
      recordsMarked: markedCount,
    });
  }

  return [...merged.values()].sort(
    (a, b) => b.sessionDate.localeCompare(a.sessionDate) || a.className.localeCompare(b.className),
  );
}

export type AttendanceReportRow = {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  sessionDate: string;
  status: AttendanceStatus;
  markedAt: string;
  markedByName: string | null;
  finalized: boolean;
};

/** Include session if `session_date` or occurrence-derived day falls in [from, to] (fixes weekly TZ skew vs report filter). */
function sessionQualifiesForReportDateRange(
  row: { session_date: string; occurrence_key: string | null },
  from: string,
  to: string,
): boolean {
  const sd = String(row.session_date).slice(0, 10);
  if (sd >= from && sd <= to) return true;
  const emb = embeddedCalendarDayFromOccurrenceKey(row.occurrence_key);
  if (emb && emb >= from && emb <= to) return true;
  const k = row.occurrence_key?.trim();
  if (k) {
    const p = parseOccurrenceKey(k);
    if (p) {
      const utcDay = p.startsAt.toISOString().slice(0, 10);
      if (utcDay >= from && utcDay <= to) return true;
    }
  }
  return false;
}

function reportSessionDateForDisplay(row: { session_date: string; occurrence_key: string | null }): string {
  const emb = embeddedCalendarDayFromOccurrenceKey(row.occurrence_key);
  if (emb) return emb;
  return String(row.session_date).slice(0, 10);
}

export async function fetchAttendanceReportForOrg(params: {
  organizationId: string;
  dateFrom: string;
  dateTo: string;
  classId?: string | null;
  /** When set (e.g. staff co-teachers), limit sessions to these classes. */
  allowedClassIds?: string[] | null;
}): Promise<AttendanceReportRow[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  if (params.allowedClassIds && params.allowedClassIds.length === 0) return [];

  const allowed =
    params.allowedClassIds && params.allowedClassIds.length > 0 ? new Set(params.allowedClassIds) : null;

  if (params.classId && allowed && !allowed.has(params.classId)) return [];

  const widenFrom = format(subDays(new Date(`${params.dateFrom}T12:00:00`), 3), "yyyy-MM-dd");
  const widenTo = format(addDays(new Date(`${params.dateTo}T12:00:00`), 3), "yyyy-MM-dd");

  /** PostgREST returns at most ~1000 rows per request; paginate so older sessions (e.g. March) are not silently dropped. */
  const pageSize = 1000;
  type SessionRow = {
    id: string;
    session_date: string;
    occurrence_key: string | null;
    attendance_finalized: boolean;
    class_id: string;
    classes: { name: string } | { name: string }[] | null;
  };
  const sessionsAccum: SessionRow[] = [];
  for (let start = 0; ; start += pageSize) {
    let q = supabase
      .from("sessions")
      .select("id, session_date, occurrence_key, attendance_finalized, class_id, classes(name)")
      .eq("organization_id", params.organizationId)
      .gte("session_date", widenFrom)
      .lte("session_date", widenTo)
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1);
    if (params.classId) q = q.eq("class_id", params.classId);
    else if (allowed) q = q.in("class_id", [...allowed]);
    const { data: sessions, error: sErr } = await q;
    if (sErr) return [];
    if (!sessions?.length) break;
    sessionsAccum.push(...(sessions as SessionRow[]));
    if (sessions.length < pageSize) break;
  }

  const inRange = sessionsAccum.filter((s) =>
    sessionQualifiesForReportDateRange(
      {
        session_date: s.session_date,
        occurrence_key: s.occurrence_key,
      },
      params.dateFrom,
      params.dateTo,
    ),
  );

  if (inRange.length === 0) return [];

  const sessionMeta = new Map<
    string,
    { sessionDate: string; finalized: boolean; classId: string; className: string }
  >();
  for (const s of inRange) {
    const cls = s.classes;
    const name =
      cls && !Array.isArray(cls) ? cls.name : Array.isArray(cls) && cls[0] ? cls[0].name : "Class";
    sessionMeta.set(s.id, {
      sessionDate: reportSessionDateForDisplay({
        session_date: s.session_date,
        occurrence_key: s.occurrence_key,
      }),
      finalized: s.attendance_finalized,
      classId: s.class_id,
      className: name,
    });
  }

  const sessionIds = inRange.map((s) => s.id);
  type RecRow = {
    id: string;
    session_id: string;
    student_id: string;
    status: string;
    marked_at: string;
    marked_by: string | null;
    students: { full_name: string } | { full_name: string }[] | null;
  };
  const recordsAccum: RecRow[] = [];
  const inChunk = 200;
  for (let i = 0; i < sessionIds.length; i += inChunk) {
    const slice = sessionIds.slice(i, i + inChunk);
    const { data: records, error: rErr } = await supabase
      .from("attendance_records")
      .select("id, session_id, student_id, status, marked_at, marked_by, students(full_name)")
      .eq("organization_id", params.organizationId)
      .in("session_id", slice);
    if (rErr) return [];
    if (records?.length) recordsAccum.push(...(records as RecRow[]));
  }

  if (recordsAccum.length === 0) return [];

  const profileNames = new Map<string, string>();
  const markedByIds = [
    ...new Set(recordsAccum.map((r) => r.marked_by).filter((x): x is string => Boolean(x))),
  ];
  if (markedByIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", markedByIds);
    for (const p of profs ?? []) {
      const pr = p as { id: string; full_name: string };
      profileNames.set(pr.id, pr.full_name);
    }
  }

  const out: AttendanceReportRow[] = [];
  for (const r of recordsAccum) {
    const m = sessionMeta.get(r.session_id);
    if (!m) continue;
    const st = r.students;
    const studentName =
      st && !Array.isArray(st) ? st.full_name : Array.isArray(st) && st[0] ? st[0].full_name : "Student";
    out.push({
      id: r.id,
      studentId: r.student_id,
      studentName,
      classId: m.classId,
      className: m.className,
      sessionDate: m.sessionDate,
      status: normalizeAttendanceStatus(r.status),
      markedAt: r.marked_at,
      markedByName: r.marked_by ? (profileNames.get(r.marked_by) ?? null) : null,
      finalized: m.finalized,
    });
  }
  return out.sort((a, b) => {
    const d = a.sessionDate.localeCompare(b.sessionDate);
    if (d !== 0) return -d;
    return a.className.localeCompare(b.className);
  });
}

/** Per-student status counts for one class over a session_date range (enrolled roster, zeros when no marks). */
export type AttendanceClassSummaryRow = {
  studentId: string;
  studentName: string;
  present: number;
  late: number;
  absentExcused: number;
  absentUnexcused: number;
};

export type AttendanceClassSummaryResult = {
  className: string;
  sessionsInRange: number;
  rows: AttendanceClassSummaryRow[];
};

export async function fetchAttendanceClassSummaryForOrg(params: {
  organizationId: string;
  dateFrom: string;
  dateTo: string;
  classId: string;
}): Promise<AttendanceClassSummaryResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { className: "Class", sessionsInRange: 0, rows: [] };
  }

  const { data: clsRow } = await supabase
    .from("classes")
    .select("name")
    .eq("id", params.classId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  const className =
    clsRow && typeof (clsRow as { name?: string }).name === "string"
      ? (clsRow as { name: string }).name
      : "Class";

  const enrollments = await fetchEnrollmentsForOrg(params.organizationId, [params.classId]);
  const rosterIds = [...new Set(enrollments.map((e) => e.studentId))];
  const students =
    rosterIds.length > 0 ? await fetchStudentsForOrg(params.organizationId, rosterIds) : [];
  const studentNameById = new Map(students.map((s) => [s.id, s.fullName]));

  type Counts = { present: number; late: number; absentExcused: number; absentUnexcused: number };
  const emptyCounts = (): Counts => ({
    present: 0,
    late: 0,
    absentExcused: 0,
    absentUnexcused: 0,
  });
  const byStudent = new Map<string, Counts>();

  const buildRows = (): AttendanceClassSummaryRow[] => {
    const out: AttendanceClassSummaryRow[] = rosterIds.map((studentId) => {
      const c = byStudent.get(studentId) ?? emptyCounts();
      return {
        studentId,
        studentName: studentNameById.get(studentId) ?? "Student",
        present: c.present,
        late: c.late,
        absentExcused: c.absentExcused,
        absentUnexcused: c.absentUnexcused,
      };
    });
    out.sort((a, b) => a.studentName.localeCompare(b.studentName));
    return out;
  };

  const widenFrom = format(subDays(new Date(`${params.dateFrom}T12:00:00`), 3), "yyyy-MM-dd");
  const widenTo = format(addDays(new Date(`${params.dateTo}T12:00:00`), 3), "yyyy-MM-dd");

  const pageSize = 1000;
  type SessionRow = { id: string; session_date: string; occurrence_key: string | null };
  const sessionsAccum: SessionRow[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data: sessions, error: sErr } = await supabase
      .from("sessions")
      .select("id, session_date, occurrence_key")
      .eq("organization_id", params.organizationId)
      .eq("class_id", params.classId)
      .gte("session_date", widenFrom)
      .lte("session_date", widenTo)
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1);
    if (sErr) return { className, sessionsInRange: 0, rows: buildRows() };
    if (!sessions?.length) break;
    sessionsAccum.push(...(sessions as SessionRow[]));
    if (sessions.length < pageSize) break;
  }

  const inRange = sessionsAccum.filter((s) =>
    sessionQualifiesForReportDateRange(
      { session_date: s.session_date, occurrence_key: s.occurrence_key },
      params.dateFrom,
      params.dateTo,
    ),
  );

  const sessionsInRange = inRange.length;
  const sessionIds = inRange.map((s) => s.id);

  const addStatus = (studentId: string, status: AttendanceStatus) => {
    let c = byStudent.get(studentId);
    if (!c) {
      c = emptyCounts();
      byStudent.set(studentId, c);
    }
    if (status === "present") c.present += 1;
    else if (status === "late") c.late += 1;
    else if (status === "absent_excused") c.absentExcused += 1;
    else c.absentUnexcused += 1;
  };

  if (sessionIds.length > 0) {
    type RecRow = { student_id: string; status: string };
    const inChunk = 200;
    for (let i = 0; i < sessionIds.length; i += inChunk) {
      const slice = sessionIds.slice(i, i + inChunk);
      const { data: records, error: rErr } = await supabase
        .from("attendance_records")
        .select("student_id, status")
        .eq("organization_id", params.organizationId)
        .in("session_id", slice);
      if (rErr) return { className, sessionsInRange, rows: buildRows() };
      for (const r of (records ?? []) as RecRow[]) {
        addStatus(r.student_id, normalizeAttendanceStatus(r.status));
      }
    }
  }

  return { className, sessionsInRange, rows: buildRows() };
}

export type AttendanceHistoryRow = {
  id: string;
  className: string;
  sessionDate: string;
  status: AttendanceStatus;
  markedAt: string;
  markedByName: string | null;
  finalized: boolean;
};

export async function fetchAttendanceHistoryForStudent(
  organizationId: string,
  studentId: string,
  params?: { dateFrom?: string; dateTo?: string },
): Promise<AttendanceHistoryRow[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const dateFrom = params?.dateFrom ?? subDays(new Date(), 90).toISOString().slice(0, 10);
  const dateTo = params?.dateTo ?? addDays(new Date(), 1).toISOString().slice(0, 10);
  const widenFrom = format(subDays(new Date(`${dateFrom}T12:00:00`), 3), "yyyy-MM-dd");
  const widenTo = format(addDays(new Date(`${dateTo}T12:00:00`), 3), "yyyy-MM-dd");

  const { data: records, error } = await supabase
    .from("attendance_records")
    .select(
      "id, status, marked_at, marked_by, sessions!inner(session_date, attendance_finalized, occurrence_key, classes(name))",
    )
    .eq("organization_id", organizationId)
    .eq("student_id", studentId)
    .gte("sessions.session_date", widenFrom)
    .lte("sessions.session_date", widenTo);

  if (error || !records?.length) return [];

  const profileIds = [
    ...new Set(
      (records as { marked_by: string | null }[])
        .map((r) => r.marked_by)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const names = new Map<string, string>();
  if (profileIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", profileIds);
    for (const p of profs ?? []) {
      const pr = p as { id: string; full_name: string };
      names.set(pr.id, pr.full_name);
    }
  }

  const out: AttendanceHistoryRow[] = [];
  for (const raw of records ?? []) {
    const r = raw as {
      id: string;
      status: string;
      marked_at: string;
      marked_by: string | null;
      sessions:
        | {
            session_date: string;
            attendance_finalized: boolean;
            occurrence_key: string | null;
            classes: { name: string } | { name: string }[] | null;
          }
        | {
            session_date: string;
            attendance_finalized: boolean;
            occurrence_key: string | null;
            classes: { name: string } | { name: string }[] | null;
          }[]
        | null;
    };
    const sRaw = r.sessions;
    const s = Array.isArray(sRaw) ? sRaw[0] : sRaw;
    if (!s) continue;
    if (
      !sessionQualifiesForReportDateRange(
        {
          session_date: s.session_date,
          occurrence_key: s.occurrence_key ?? null,
        },
        dateFrom,
        dateTo,
      )
    )
      continue;
    const sessionDate = reportSessionDateForDisplay({
      session_date: s.session_date,
      occurrence_key: s.occurrence_key ?? null,
    });
    const cls = s.classes;
    const className =
      cls && !Array.isArray(cls) ? cls.name : Array.isArray(cls) && cls[0] ? cls[0].name : "Class";
    out.push({
      id: r.id,
      className,
      sessionDate,
      status: normalizeAttendanceStatus(r.status),
      markedAt: r.marked_at,
      markedByName: r.marked_by ? (names.get(r.marked_by) ?? null) : null,
      finalized: s.attendance_finalized,
    });
  }
  return out.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
}

export type MissedAttendanceItem = {
  occurrenceKey: string;
  classId: string;
  className: string;
  startsAt: string;
  sessionDate: string;
};

/** Past scheduled occurrences without a finalized attendance session (draft counts as incomplete). */
export async function fetchMissedAttendanceOccurrences(
  organizationId: string,
  access: TeacherClassAccess | null = null,
  preloaded: AttendanceSchedulePreload | null = null,
): Promise<MissedAttendanceItem[]> {
  const classes =
    preloaded?.classes ?? (await fetchClassesForOrg(organizationId, access));
  const enrollments =
    preloaded?.enrollments ?? (await fetchEnrollmentsForOrg(organizationId));
  const classIdsWithStudents = new Set(
    enrollments.filter((e) => classes.some((c) => c.id === e.classId)).map((e) => e.classId),
  );
  const teachable = classes.filter((c) => classIdsWithStudents.has(c.id));
  if (teachable.length === 0) return [];

  const tz = await getScheduleTimezoneForOrganization(organizationId);
  const now = new Date();
  const rangeStart = subDays(now, 30);
  const rangeEnd = addDays(now, 1);
  const events = getScheduleEvents(teachable, rangeStart, rangeEnd, tz);
  const past = events.filter((e) => +new Date(e.startsAt) < +now);

  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const teachableById = new Map(teachable.map((c) => [c.id, c]));

  const finalizedByKey = new Map<string, boolean>();
  if (past.length > 0) {
    const keys = [...new Set(past.map((e) => buildOccurrenceKey(e.classId, e.slotId, e.startsAt)))];
    const chunk = 80;
    for (let i = 0; i < keys.length; i += chunk) {
      const slice = keys.slice(i, i + chunk);
      const { data: sess } = await supabase
        .from("sessions")
        .select("occurrence_key, attendance_finalized")
        .eq("organization_id", organizationId)
        .in("occurrence_key", slice);
      for (const row of sess ?? []) {
        const s = row as { occurrence_key: string; attendance_finalized: boolean };
        if (!s.occurrence_key) continue;
        finalizedByKey.set(
          s.occurrence_key,
          (finalizedByKey.get(s.occurrence_key) ?? false) || s.attendance_finalized,
        );
      }
    }
  }

  const seen = new Set<string>();
  const missed: MissedAttendanceItem[] = [];
  for (const e of past) {
    const key = buildOccurrenceKey(e.classId, e.slotId, e.startsAt);
    if (finalizedByKey.get(key) === true) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    missed.push({
      occurrenceKey: key,
      classId: e.classId,
      className: e.className,
      startsAt: e.startsAt,
      sessionDate: sessionDateFromScheduleInstant(e.startsAt, tz),
    });
  }

  /**
   * Merge non-finalized `sessions` rows when schedule expansion missed them (timezone/server).
   * Skip classes with no defined schedule so draft rows from old tests do not linger after the calendar
   * is cleared — those rows remain in the DB until deleted or finalized.
   */
  if (supabase) {
    const cutoffStr = format(subDays(now, 60), "yyyy-MM-dd");
    const todayStr = format(now, "yyyy-MM-dd");
    const teachableClassIds = teachable.map((c) => c.id);
    const teachableClassIdSet = new Set(teachableClassIds);
    type DbRowRaw = {
      occurrence_key: string | null;
      session_date: string;
      class_id: string;
      classes: { name: string } | { name: string }[] | null;
    };
    const classChunk = 120;
    const dbRowsAccum: DbRowRaw[] = [];

    if (teachableClassIds.length === 0) {
      // no teachable classes — skip DB merge
    } else {
      for (let c = 0; c < teachableClassIds.length; c += classChunk) {
        const slice = teachableClassIds.slice(c, c + classChunk);
        const { data: dbRows } = await supabase
          .from("sessions")
          .select("occurrence_key, session_date, class_id, classes(name)")
          .eq("organization_id", organizationId)
          .eq("attendance_finalized", false)
          .lte("session_date", todayStr)
          .gte("session_date", cutoffStr)
          .in("class_id", slice);

        if (dbRows?.length) dbRowsAccum.push(...(dbRows as DbRowRaw[]));
      }
    }

    for (const row of dbRowsAccum) {
      if (!teachableClassIdSet.has(row.class_id)) continue;
      const classRoom = teachableById.get(row.class_id);
      if (!classRoom || !classHasDefinedSchedule(classRoom)) continue;

      const cls = row.classes;
      const className =
        cls && !Array.isArray(cls) ? cls.name : Array.isArray(cls) && cls[0] ? cls[0].name : null;
      if (!className) continue;

      const occ = row.occurrence_key?.trim();
      if (!occ) continue;

      const parsed = parseOccurrenceKey(occ);
      if (!parsed) continue;
      const startMs = +parsed.startsAt;
      if (Number.isNaN(startMs) || startMs >= +now) continue;

      if (seen.has(occ)) continue;
      seen.add(occ);

      missed.push({
        occurrenceKey: occ,
        classId: row.class_id,
        className,
        startsAt: parsed.startsAt.toISOString(),
        sessionDate: sessionDateFromScheduleInstant(parsed.startsAt, tz),
      });
    }
  }

  return missed.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

/** Default session length when computing “in session” / “missed” windows (matches typical class block). */
const DEFAULT_CLASS_DURATION_MS = 50 * 60 * 1000;
/** “Starting soon” — class begins within this window from now. */
const ATTENDANCE_IMMINENT_MS = 30 * 60 * 1000;
/** After class end, still show as catch-up for this long. */
const ATTENDANCE_MISSED_RECENT_MS = 72 * 60 * 60 * 1000;

export type AttendancePriorityRow = {
  classId: string;
  className: string;
  occurrenceKey: string;
  startsAt: string;
  sessionDate: string;
  kind: "in_session" | "imminent" | "missed";
};

function attendanceKindForInstant(
  nowMs: number,
  startMs: number,
  durationMs: number,
): "in_session" | "imminent" | "missed" | null {
  const endMs = startMs + durationMs;
  if (nowMs >= startMs && nowMs < endMs) return "in_session";
  if (nowMs < startMs && startMs <= nowMs + ATTENDANCE_IMMINENT_MS) return "imminent";
  if (nowMs >= endMs && nowMs - endMs <= ATTENDANCE_MISSED_RECENT_MS) return "missed";
  return null;
}

function betterAttendancePriority(
  a: { kind: "in_session" | "imminent" | "missed"; startMs: number },
  b: { kind: "in_session" | "imminent" | "missed"; startMs: number },
): boolean {
  const order = { in_session: 0, imminent: 1, missed: 2 };
  if (order[a.kind] !== order[b.kind]) return order[a.kind] < order[b.kind];
  if (a.kind === "missed") return a.startMs > b.startMs;
  return a.startMs < b.startMs;
}

/**
 * Classes that need attendance attention now: in session, starting within 30 minutes, or recently ended
 * without finalized attendance. Uses schedule + sessions.attendance_finalized (not draft-only heuristics).
 */
export async function fetchAttendancePriorityClasses(
  organizationId: string,
  access: TeacherClassAccess | null = null,
  preloaded: AttendanceSchedulePreload | null = null,
): Promise<AttendancePriorityRow[]> {
  const classes =
    preloaded?.classes ?? (await fetchClassesForOrg(organizationId, access));
  const enrollments =
    preloaded?.enrollments ?? (await fetchEnrollmentsForOrg(organizationId));
  const classIdsWithStudents = new Set(
    enrollments.filter((e) => classes.some((c) => c.id === e.classId)).map((e) => e.classId),
  );
  const teachable = classes.filter((c) => classIdsWithStudents.has(c.id));
  if (teachable.length === 0) return [];

  const tz = await getScheduleTimezoneForOrganization(organizationId);
  const now = new Date();
  const nowMs = +now;
  const rangeStart = subDays(now, 5);
  const rangeEnd = addDays(now, 2);
  const events = getScheduleEvents(teachable, rangeStart, rangeEnd, tz);
  if (events.length === 0) return [];

  const keys = [...new Set(events.map((e) => buildOccurrenceKey(e.classId, e.slotId, e.startsAt)))];
  const finalizedByKey = new Map<string, boolean>();
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const chunk = 80;
    for (let i = 0; i < keys.length; i += chunk) {
      const slice = keys.slice(i, i + chunk);
      const { data: sess } = await supabase
        .from("sessions")
        .select("occurrence_key, attendance_finalized")
        .eq("organization_id", organizationId)
        .in("occurrence_key", slice);
      for (const row of sess ?? []) {
        const s = row as { occurrence_key: string; attendance_finalized: boolean };
        if (!s.occurrence_key) continue;
        finalizedByKey.set(
          s.occurrence_key,
          (finalizedByKey.get(s.occurrence_key) ?? false) || s.attendance_finalized,
        );
      }
    }
  }

  const bestByClass = new Map<
    string,
    { kind: "in_session" | "imminent" | "missed"; startMs: number; event: (typeof events)[0] }
  >();

  for (const e of events) {
    const startMs = +new Date(e.startsAt);
    if (Number.isNaN(startMs)) continue;
    const key = buildOccurrenceKey(e.classId, e.slotId, e.startsAt);
    if (finalizedByKey.get(key) === true) continue;

    const kind = attendanceKindForInstant(nowMs, startMs, DEFAULT_CLASS_DURATION_MS);
    if (!kind) continue;

    const prev = bestByClass.get(e.classId);
    const candidate = { kind, startMs, event: e };
    if (!prev || betterAttendancePriority(candidate, prev)) {
      bestByClass.set(e.classId, candidate);
    }
  }

  const rows: AttendancePriorityRow[] = [];
  for (const { kind, event } of bestByClass.values()) {
    rows.push({
      classId: event.classId,
      className: event.className,
      occurrenceKey: buildOccurrenceKey(event.classId, event.slotId, event.startsAt),
      startsAt: event.startsAt,
      sessionDate: sessionDateFromScheduleInstant(event.startsAt, tz),
      kind,
    });
  }

  const kindRank = { in_session: 0, imminent: 1, missed: 2 };
  rows.sort((a, b) => {
    const d = kindRank[a.kind] - kindRank[b.kind];
    if (d !== 0) return d;
    const ta = +new Date(a.startsAt);
    const tb = +new Date(b.startsAt);
    if (a.kind === "missed") return tb - ta;
    return ta - tb;
  });
  return rows;
}

/** Resolve calendar occurrence keys to DB sessions for schedule → attendance deep links. */
export async function fetchAttendanceOccurrenceStatusMap(
  organizationId: string,
  occurrenceKeys: string[],
): Promise<Record<string, { sessionId: string; attendanceFinalized: boolean }>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return {};
  const unique = [...new Set(occurrenceKeys.filter((k) => k.trim().length > 0))];
  const out: Record<string, { sessionId: string; attendanceFinalized: boolean }> = {};
  const chunk = 80;
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("sessions")
      .select("id, occurrence_key, attendance_finalized")
      .eq("organization_id", organizationId)
      .in("occurrence_key", slice);
    if (error || !data) continue;
    for (const row of data as { id: string; occurrence_key: string | null; attendance_finalized: boolean }[]) {
      if (!row.occurrence_key) continue;
      const prev = out[row.occurrence_key];
      if (!prev) {
        out[row.occurrence_key] = { sessionId: row.id, attendanceFinalized: row.attendance_finalized };
      } else {
        out[row.occurrence_key] = {
          sessionId: row.id,
          attendanceFinalized: prev.attendanceFinalized || row.attendance_finalized,
        };
      }
    }
  }
  return out;
}

export type ClassAttendanceSlotRow = {
  occurrenceKey: string;
  startsAt: string;
  sessionDate: string;
  sessionId: string | null;
  attendanceFinalized: boolean;
};

/** Scheduled occurrences for one class with DB session/finalized state (for class detail + catch-up). */
export async function fetchAttendanceSlotsForClass(
  organizationId: string,
  classRoom: ClassRoom,
): Promise<ClassAttendanceSlotRow[]> {
  const tz = await getScheduleTimezoneForOrganization(organizationId);
  const now = new Date();
  const rangeStart = subDays(now, 21);
  /** Expand through today only; then keep slots whose start is already in the past (no upcoming / future weeks). */
  const rangeEnd = endOfDay(now);
  const rangeStartMs = +rangeStart;
  const nowMs = +now;
  const events = getScheduleEvents([classRoom], rangeStart, rangeEnd, tz).filter((e) => {
    const t = +new Date(e.startsAt);
    return !Number.isNaN(t) && t >= rangeStartMs && t < nowMs;
  });
  if (events.length === 0) return [];

  const keys = [...new Set(events.map((e) => buildOccurrenceKey(e.classId, e.slotId, e.startsAt)))];
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const byKey = new Map<string, { id: string; attendance_finalized: boolean }>();
  const chunk = 80;
  for (let i = 0; i < keys.length; i += chunk) {
    const slice = keys.slice(i, i + chunk);
    const { data } = await supabase
      .from("sessions")
      .select("id, occurrence_key, attendance_finalized")
      .eq("organization_id", organizationId)
      .eq("class_id", classRoom.id)
      .in("occurrence_key", slice);
    for (const row of data ?? []) {
      const r = row as { id: string; occurrence_key: string | null; attendance_finalized: boolean };
      if (!r.occurrence_key) continue;
      const prev = byKey.get(r.occurrence_key);
      if (!prev) {
        byKey.set(r.occurrence_key, { id: r.id, attendance_finalized: r.attendance_finalized });
      } else {
        byKey.set(r.occurrence_key, {
          id: r.id,
          attendance_finalized: prev.attendance_finalized || r.attendance_finalized,
        });
      }
    }
  }

  const rows: ClassAttendanceSlotRow[] = events.map((e) => {
    const k = buildOccurrenceKey(e.classId, e.slotId, e.startsAt);
    const s = byKey.get(k);
    return {
      occurrenceKey: k,
      startsAt: e.startsAt,
      sessionDate: sessionDateFromScheduleInstant(e.startsAt, tz),
      sessionId: s?.id ?? null,
      attendanceFinalized: s?.attendance_finalized ?? false,
    };
  });
  rows.sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
  return rows.slice(0, 36);
}

type ClassFeedPostRow = {
  id: string;
  organization_id: string;
  class_id: string;
  title: string | null;
  body: string;
  status: "draft" | "published";
  visibility: "internal" | "parent_visible";
  pinned: boolean;
  archived_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  published_by: string | null;
};

export async function fetchClassFeedPosts(params: {
  organizationId: string;
  classId: string;
  includeDrafts?: boolean;
}): Promise<{ posts: ClassFeedPost[]; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { posts: [], error: "Supabase client unavailable" };

  let query = supabase
    .from("feed_posts")
    .select("id, organization_id, class_id, title, body, status, visibility, pinned, archived_at, published_at, created_at, updated_at, created_by, published_by")
    .eq("organization_id", params.organizationId)
    .eq("class_id", params.classId)
    .is("archived_at", null)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (!params.includeDrafts) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query;
  if (error) return { posts: [], error: error.message };
  if (!data?.length) return { posts: [], error: null };
  const posts = data as ClassFeedPostRow[];

  const postIds = posts.map((p) => p.id);
  const [studentRows, tagRows, mediaRows] = await Promise.all([
    supabase.from("class_post_students").select("post_id, student_id").in("post_id", postIds),
    supabase.from("class_post_tags").select("post_id, tag").in("post_id", postIds),
    supabase
      .from("class_post_media")
      .select("id, post_id, storage_path, mime_type, created_at")
      .in("post_id", postIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const studentsByPost = new Map<string, string[]>();
  for (const row of (studentRows.data ?? []) as { post_id: string; student_id: string }[]) {
    const prev = studentsByPost.get(row.post_id) ?? [];
    prev.push(row.student_id);
    studentsByPost.set(row.post_id, prev);
  }

  const tagsByPost = new Map<string, string[]>();
  for (const row of (tagRows.data ?? []) as { post_id: string; tag: string }[]) {
    const prev = tagsByPost.get(row.post_id) ?? [];
    prev.push(row.tag);
    tagsByPost.set(row.post_id, prev);
  }

  const mediaByPost = new Map<string, ClassFeedPost["media"]>();
  for (const row of (mediaRows.data ?? []) as {
    id: string;
    post_id: string;
    storage_path: string;
    mime_type: string | null;
    created_at: string;
  }[]) {
    const prev = mediaByPost.get(row.post_id) ?? [];
    prev.push({
      id: row.id,
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      createdAt: row.created_at,
    });
    mediaByPost.set(row.post_id, prev);
  }

  const mapped = posts.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    title: row.title,
    body: row.body,
    status: row.status,
    visibility: row.visibility,
    pinned: row.pinned,
    archivedAt: row.archived_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    publishedBy: row.published_by,
    studentIds: studentsByPost.get(row.id) ?? [],
    tags: tagsByPost.get(row.id) ?? [],
    media: mediaByPost.get(row.id) ?? [],
  }));
  const secondaryError =
    studentRows.error?.message ?? tagRows.error?.message ?? mediaRows.error?.message ?? null;
  return { posts: mapped, error: secondaryError };
}
