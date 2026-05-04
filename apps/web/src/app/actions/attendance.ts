"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchOrgMembershipRole } from "@/lib/organization-server";
import {
  fetchAttendanceOccurrenceStatusMap,
  fetchEnrollmentsForOrg,
  fetchStudentsForOrg,
  teacherHasAccessToClass,
  verifyOrgMembership,
} from "@/lib/tracker-queries";
import type { AttendanceStatus, Student } from "@/lib/tracker-types";

type ClassAttendanceRole = "lead" | "co_teacher" | "assistant" | "none";

async function requireTeacherOrg(organizationId: string) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, userId: null as string | null, ok: false as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, userId: null, ok: false as const };
  const ok = await verifyOrgMembership(user.id, organizationId);
  if (!ok) return { supabase, userId: user.id, ok: false as const };
  return { supabase, userId: user.id, ok: true as const };
}

async function resolveClassAttendanceRole(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  organizationId: string,
  classId: string,
  userId: string,
): Promise<ClassAttendanceRole> {
  const { data: cls } = await supabase
    .from("classes")
    .select("tutor_id")
    .eq("organization_id", organizationId)
    .eq("id", classId)
    .maybeSingle();
  const tutorId = (cls as { tutor_id: string | null } | null)?.tutor_id;
  if (tutorId && tutorId === userId) return "lead";

  const { data: ct } = await supabase
    .from("class_teachers")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("class_id", classId)
    .eq("profile_id", userId)
    .maybeSingle();
  const role = (ct as { role?: string } | null)?.role;
  if (role === "co_teacher" || role === "assistant") return role;
  return "none";
}

/** Lazy roster load: enrolled student rows for one class only (JWT + teacher access guarded). */
export async function fetchClassRosterStudentsAction(params: {
  organizationId: string;
  classId: string;
}): Promise<{ ok: true; students: Student[] } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok || !ctx.supabase || !ctx.userId) return { ok: false, error: "Unauthorized" };

  const orgRole = await fetchOrgMembershipRole(ctx.userId, params.organizationId);
  const allowed = await teacherHasAccessToClass(
    params.organizationId,
    ctx.userId,
    orgRole ?? "staff",
    params.classId,
  );
  if (!allowed) return { ok: false, error: "Not allowed for this class" };

  const enrollments = await fetchEnrollmentsForOrg(params.organizationId, [params.classId]);
  const ids = [...new Set(enrollments.map((e) => e.studentId))];
  if (ids.length === 0) return { ok: true, students: [] };

  const students = await fetchStudentsForOrg(params.organizationId, ids);
  return { ok: true, students };
}

export async function saveAttendanceBundleAction(params: {
  organizationId: string;
  classId: string;
  sessionId: string | null;
  occurrenceKey: string | null;
  sessionDate: string;
  rows: { studentId: string; status: AttendanceStatus }[];
}): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok || !ctx.supabase) return { ok: false, error: "Unauthorized" };

  const rows = params.rows.map((r) => ({
    student_id: r.studentId,
    status: r.status,
  }));

  const { data, error } = await ctx.supabase.rpc("save_attendance_bundle", {
    p_organization_id: params.organizationId,
    p_class_id: params.classId,
    p_session_id: params.sessionId,
    p_occurrence_key: params.occurrenceKey ?? "",
    p_session_date: params.sessionDate,
    p_rows: rows,
  });

  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string; session_id?: string } | null;
  if (!row || row.ok !== true || typeof row.session_id !== "string") {
    return { ok: false, error: typeof row?.error === "string" ? row.error : "Save failed" };
  }

  /** Draft saves: invalidate attendance surfaces only; home/students/onboarding refresh on finalize. */
  revalidatePath("/attendance");
  revalidatePath("/attendance/report");
  revalidatePath("/attendance/missed");
  revalidatePath("/attendance/finalized-by-me");

  return { ok: true, sessionId: row.session_id };
}

export async function finalizeAttendanceSessionAction(params: {
  organizationId: string;
  sessionId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok || !ctx.supabase) return { ok: false, error: "Unauthorized" };

  const { data, error } = await ctx.supabase.rpc("finalize_attendance_session", {
    p_session_id: params.sessionId,
  });

  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row || row.ok !== true) {
    return { ok: false, error: typeof row?.error === "string" ? row.error : "Finalize failed" };
  }

  revalidatePath("/attendance");
  revalidatePath("/attendance/report");
  revalidatePath("/attendance/missed");
  revalidatePath("/attendance/finalized-by-me");
  revalidatePath("/onboarding");
  revalidatePath("/students");
  revalidatePath("/");

  return { ok: true };
}

/** Return a finalized session to draft so the roster can be edited and saved again. */
export async function reopenAttendanceSessionAction(params: {
  organizationId: string;
  sessionId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok || !ctx.supabase || !ctx.userId) return { ok: false, error: "Unauthorized" };

  const { data: sess } = await ctx.supabase
    .from("sessions")
    .select("class_id")
    .eq("organization_id", params.organizationId)
    .eq("id", params.sessionId)
    .maybeSingle();
  const classId = (sess as { class_id?: string } | null)?.class_id;
  if (!classId) return { ok: false, error: "Session not found" };

  const classRole = await resolveClassAttendanceRole(ctx.supabase, params.organizationId, classId, ctx.userId);
  if (classRole !== "lead" && classRole !== "co_teacher") {
    return { ok: false, error: "Only lead teachers and co-teachers can reopen attendance." };
  }

  const { error } = await ctx.supabase
    .from("sessions")
    .update({ attendance_finalized: false, status: "scheduled", attendance_finalized_by: null })
    .eq("id", params.sessionId)
    .eq("organization_id", params.organizationId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/attendance");
  revalidatePath("/attendance/report");
  revalidatePath("/attendance/missed");
  revalidatePath("/attendance/finalized-by-me");
  revalidatePath("/onboarding");
  revalidatePath("/students");
  revalidatePath("/");

  return { ok: true };
}

/** Create or resolve a session row for an occurrence (empty roster payload is allowed). */
export async function ensureAttendanceSessionAction(params: {
  organizationId: string;
  classId: string;
  occurrenceKey: string;
  sessionDate: string;
}): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  return saveAttendanceBundleAction({
    organizationId: params.organizationId,
    classId: params.classId,
    sessionId: null,
    occurrenceKey: params.occurrenceKey,
    sessionDate: params.sessionDate,
    rows: [],
  });
}

/** For schedule calendar: map occurrence keys to session ids and finalized state (RLS-scoped). */
export async function fetchAttendanceOccurrenceStatusMapAction(params: {
  organizationId: string;
  occurrenceKeys: string[];
}): Promise<Record<string, { sessionId: string; attendanceFinalized: boolean }>> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok) return {};
  return fetchAttendanceOccurrenceStatusMap(params.organizationId, params.occurrenceKeys);
}
