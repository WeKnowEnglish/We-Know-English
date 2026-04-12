"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { classRoomToSettingsPatch, studentToProfilePatch } from "@/lib/tracker-mappers";
import { verifyOrgMembership } from "@/lib/tracker-queries";
import { makeAvatar } from "@/lib/student-utils";
import type { ClassGradeLevel, ClassRoom, Student, StudentClassEnrollment } from "@/lib/tracker-types";

export type JoinClassResult =
  | { ok: true; kind: "joined"; className: string }
  | { ok: true; kind: "already_enrolled"; className: string }
  | { ok: false; message: string };

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

function generateJoinCode(existing: Set<string>): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 32; i += 1) {
    let value = "";
    for (let j = 0; j < 6; j += 1) {
      value += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!existing.has(value)) return value;
  }
  return `C${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

export async function createClassAction(
  organizationId: string,
  input: { name: string; grades: ClassGradeLevel[]; cefrLevel: ClassRoom["cefrLevel"] },
): Promise<{ ok: true; classId: string } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(organizationId);
  if (!ctx.ok || !ctx.supabase || !ctx.userId) return { ok: false, error: "Unauthorized" };

  const trimmed = input.name.trim();
  if (!trimmed) return { ok: false, error: "Class name is required" };
  if (!input.grades?.length) return { ok: false, error: "Select at least one grade" };

  const { data: existingRows } = await ctx.supabase.from("classes").select("settings").eq("organization_id", organizationId);
  const codes = new Set<string>();
  for (const row of existingRows ?? []) {
    const s = (row as { settings?: { joinCode?: string } }).settings;
    if (s?.joinCode) codes.add(s.joinCode);
  }
  const joinCode = generateJoinCode(codes);
  const now = new Date().toISOString();
  const classRoom: ClassRoom = {
    id: "",
    name: trimmed,
    grades: input.grades,
    cefrLevel: input.cefrLevel,
    joinCode,
    nextSessionAt: "",
    updatedAt: now,
    scheduleSlots: [],
  };
  const settings = classRoomToSettingsPatch(classRoom);

  const { data, error } = await ctx.supabase
    .from("classes")
    .insert({
      organization_id: organizationId,
      name: trimmed,
      class_type: "small_group",
      duration_minutes: 50,
      title: trimmed,
      settings,
      tutor_id: ctx.userId,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed" };

  revalidatePath("/onboarding");
  revalidatePath("/");
  revalidatePath("/schedule");
  return { ok: true, classId: data.id as string };
}

export async function updateClassesOrderAction(organizationId: string, orderedIds: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(organizationId);
  if (!ctx.ok || !ctx.supabase) return { ok: false, error: "Unauthorized" };

  const { data: rows } = await ctx.supabase.from("classes").select("id, settings").eq("organization_id", organizationId);
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  let i = 0;
  for (const id of orderedIds) {
    const row = byId.get(id);
    if (!row) continue;
    const settings = { ...((row.settings as object) ?? {}), sortOrder: i++ };
    await ctx.supabase.from("classes").update({ settings }).eq("id", id).eq("organization_id", organizationId);
  }
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function deleteClassAction(organizationId: string, classId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(organizationId);
  if (!ctx.ok || !ctx.supabase) return { ok: false, error: "Unauthorized" };

  const { error } = await ctx.supabase.from("classes").delete().eq("id", classId).eq("organization_id", organizationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/onboarding");
  revalidatePath("/schedule");
  revalidatePath("/");
  return { ok: true };
}

export async function upsertClassPayloadAction(organizationId: string, classRoom: ClassRoom): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(organizationId);
  if (!ctx.ok || !ctx.supabase) return { ok: false, error: "Unauthorized" };

  const settings = classRoomToSettingsPatch(classRoom);
  const { error } = await ctx.supabase
    .from("classes")
    .update({
      name: classRoom.name,
      title: classRoom.name,
      settings,
    })
    .eq("id", classRoom.id)
    .eq("organization_id", organizationId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/onboarding");
  revalidatePath(`/onboarding/${classRoom.id}`);
  revalidatePath("/schedule");
  return { ok: true };
}

export async function createStudentAction(
  organizationId: string,
  input: {
    fullName: string;
    email: string;
    gender: Student["gender"];
    birthday?: string;
    level: string;
    classId: string | "none";
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(organizationId);
  if (!ctx.ok || !ctx.supabase) return { ok: false, error: "Unauthorized" };

  const trimmedName = input.fullName.trim();
  if (!trimmedName) return { ok: false, error: "Name is required" };

  const birthdate = input.birthday?.trim() || null;

  const emailNorm = input.email.trim().toLowerCase();
  const profile = studentToProfilePatch({
    avatar: makeAvatar(trimmedName),
    gender: input.gender,
    level: input.level,
    accountStatus: "unlinked",
    birthday: birthdate ?? undefined,
  });

  const { data: studentRow, error } = await ctx.supabase
    .from("students")
    .insert({
      organization_id: organizationId,
      full_name: trimmedName,
      level: input.level,
      email: emailNorm.length > 0 ? emailNorm : null,
      birthdate,
      profile,
      skills_points: 0,
    })
    .select("id")
    .single();

  if (error || !studentRow) return { ok: false, error: error?.message ?? "Could not create student" };

  const studentId = studentRow.id as string;
  if (input.classId !== "none") {
    const { error: enrErr } = await ctx.supabase.from("enrollments").insert({
      organization_id: organizationId,
      class_id: input.classId,
      student_id: studentId,
    });
    if (enrErr) return { ok: false, error: enrErr.message };
  }

  revalidatePath("/students");
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function deleteStudentAction(organizationId: string, studentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(organizationId);
  if (!ctx.ok || !ctx.supabase) return { ok: false, error: "Unauthorized" };

  const { error } = await ctx.supabase.from("students").delete().eq("id", studentId).eq("organization_id", organizationId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/students");
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function setEnrollmentsForClassAction(
  organizationId: string,
  classId: string,
  next: StudentClassEnrollment[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(organizationId);
  if (!ctx.ok || !ctx.supabase) return { ok: false, error: "Unauthorized" };

  const { data: existing } = await ctx.supabase.from("enrollments").select("id, student_id").eq("organization_id", organizationId).eq("class_id", classId);

  const want = new Set(next.map((r) => r.studentId));
  for (const row of existing ?? []) {
    if (!want.has(row.student_id as string)) {
      await ctx.supabase.from("enrollments").delete().eq("id", row.id as string);
    }
  }

  const have = new Set((existing ?? []).map((r) => r.student_id as string));
  for (const row of next) {
    if (row.classId !== classId) continue;
    if (have.has(row.studentId)) continue;
    const { error } = await ctx.supabase.from("enrollments").insert({
      organization_id: organizationId,
      class_id: classId,
      student_id: row.studentId,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/onboarding");
  revalidatePath("/students");
  return { ok: true };
}

export async function addEnrollmentAction(
  organizationId: string,
  classId: string,
  studentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(organizationId);
  if (!ctx.ok || !ctx.supabase) return { ok: false, error: "Unauthorized" };

  const { error } = await ctx.supabase.from("enrollments").insert({
    organization_id: organizationId,
    class_id: classId,
    student_id: studentId,
  });
  if (error) {
    if (error.code === "23505") return { ok: true };
    return { ok: false, error: error.message };
  }
  revalidatePath("/onboarding");
  revalidatePath("/students");
  return { ok: true };
}

export async function removeEnrollmentAction(
  organizationId: string,
  classId: string,
  studentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(organizationId);
  if (!ctx.ok || !ctx.supabase) return { ok: false, error: "Unauthorized" };

  const { error } = await ctx.supabase
    .from("enrollments")
    .delete()
    .eq("organization_id", organizationId)
    .eq("class_id", classId)
    .eq("student_id", studentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/onboarding");
  revalidatePath("/students");
  return { ok: true };
}

export async function removeAllEnrollmentsForClassAction(
  organizationId: string,
  classId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(organizationId);
  if (!ctx.ok || !ctx.supabase) return { ok: false, error: "Unauthorized" };

  const { error } = await ctx.supabase.from("enrollments").delete().eq("organization_id", organizationId).eq("class_id", classId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/onboarding");
  revalidatePath("/students");
  return { ok: true };
}

export async function claimStudentAccountsOnSignupAction(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { data, error } = await supabase.rpc("claim_student_accounts_on_signup");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  revalidatePath("/students");
  return { ok: true, count: typeof data === "number" ? data : 0 };
}

type JoinClassRpcPayload = {
  ok?: boolean;
  /** RPC returns `error` on failure (see join_class_by_code migration). */
  error?: string;
  message?: string;
  kind?: string;
  className?: string;
};

export async function joinClassByCodeStudentAction(joinCode: string): Promise<JoinClassResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const trimmed = joinCode.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter a join code." };
  }

  await supabase.rpc("ensure_my_profile");

  const { data, error } = await supabase.rpc("join_class_by_code", { p_join_code: trimmed });
  if (error) {
    return { ok: false, message: error.message };
  }

  const row = data as JoinClassRpcPayload | null;
  if (!row || typeof row !== "object") {
    return { ok: false, message: "Unexpected response from server." };
  }
  if (row.ok === false) {
    const errText =
      typeof row.error === "string" ? row.error : typeof row.message === "string" ? row.message : "Could not join class.";
    return { ok: false, message: errText };
  }
  if (row.ok === true && row.kind === "already_enrolled" && typeof row.className === "string") {
    revalidatePath("/");
    revalidatePath("/students");
    revalidatePath("/onboarding");
    return { ok: true, kind: "already_enrolled", className: row.className };
  }
  if (row.ok === true && row.kind === "joined" && typeof row.className === "string") {
    revalidatePath("/");
    revalidatePath("/students");
    revalidatePath("/onboarding");
    return { ok: true, kind: "joined", className: row.className };
  }

  return { ok: false, message: "Unexpected response from server." };
}

export type LeaveClassResult =
  | { ok: true; className: string }
  | { ok: false; message: string };

type LeaveClassRpcPayload = {
  ok?: boolean;
  error?: string;
  className?: string;
};

export async function leaveClassEnrollmentStudentAction(classId: string): Promise<LeaveClassResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, message: "Supabase is not configured." };
  }
  const trimmed = classId.trim();
  if (!trimmed) {
    return { ok: false, message: "Missing class." };
  }

  const { data, error } = await supabase.rpc("leave_class_enrollment_as_student", { p_class_id: trimmed });
  if (error) {
    return { ok: false, message: error.message };
  }

  const row = data as LeaveClassRpcPayload | null;
  if (!row || typeof row !== "object") {
    return { ok: false, message: "Unexpected response from server." };
  }
  if (row.ok === false) {
    return { ok: false, message: typeof row.error === "string" ? row.error : "Could not leave class." };
  }
  if (row.ok === true && typeof row.className === "string") {
    revalidatePath("/");
    revalidatePath("/students");
    revalidatePath("/onboarding");
    return { ok: true, className: row.className };
  }

  return { ok: false, message: "Unexpected response from server." };
}
