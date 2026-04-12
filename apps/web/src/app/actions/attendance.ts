"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchAttendanceOccurrenceStatusMap, verifyOrgMembership } from "@/lib/tracker-queries";
import type { AttendanceStatus } from "@/lib/tracker-types";

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

  revalidatePath("/attendance");
  revalidatePath("/attendance/report");
  revalidatePath("/attendance/missed");
  revalidatePath("/attendance/finalized-by-me");
  revalidatePath("/onboarding");
  revalidatePath("/students");
  revalidatePath("/");

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

  return { ok: true };
}

/** Return a finalized session to draft so the roster can be edited and saved again. */
export async function reopenAttendanceSessionAction(params: {
  organizationId: string;
  sessionId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok || !ctx.supabase) return { ok: false, error: "Unauthorized" };

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
