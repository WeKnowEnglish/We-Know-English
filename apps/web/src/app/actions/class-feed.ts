"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifyOrgMembership } from "@/lib/tracker-queries";

type ClassFeedRole = "lead" | "co_teacher" | "assistant" | "none";

async function requireTeacherOrg(organizationId: string) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false as const, supabase: null, userId: null as string | null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, supabase, userId: null };
  const ok = await verifyOrgMembership(user.id, organizationId);
  if (!ok) return { ok: false as const, supabase, userId: user.id };
  return { ok: true as const, supabase, userId: user.id };
}

async function resolveClassFeedRole(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  organizationId: string,
  classId: string,
  userId: string,
): Promise<ClassFeedRole> {
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
  if (role === "assistant" || role === "co_teacher") return role;
  return "none";
}

export async function createClassPostDraftAction(params: {
  organizationId: string;
  classId: string;
  title?: string;
  body: string;
}): Promise<{ ok: true; postId: string } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok || !ctx.supabase || !ctx.userId) return { ok: false, error: "Unauthorized" };

  const role = await resolveClassFeedRole(ctx.supabase, params.organizationId, params.classId, ctx.userId);
  if (role === "none") return { ok: false, error: "You do not have class feed access." };

  const { data, error } = await ctx.supabase.rpc("create_class_post_draft", {
    p_organization_id: params.organizationId,
    p_class_id: params.classId,
    p_body: params.body,
    p_title: params.title ?? "",
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string; post_id?: string } | null;
  if (!row || row.ok !== true || typeof row.post_id !== "string") {
    return { ok: false, error: typeof row?.error === "string" ? row.error : "Could not create post" };
  }

  revalidatePath(`/classes/${params.classId}/feed`);
  return { ok: true, postId: row.post_id };
}

export async function updateClassPostDraftAction(params: {
  organizationId: string;
  classId: string;
  postId: string;
  title?: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok || !ctx.supabase || !ctx.userId) return { ok: false, error: "Unauthorized" };

  const role = await resolveClassFeedRole(ctx.supabase, params.organizationId, params.classId, ctx.userId);
  if (role === "none") return { ok: false, error: "You do not have class feed access." };

  const { data, error } = await ctx.supabase.rpc("update_class_post_draft", {
    p_post_id: params.postId,
    p_body: params.body,
    p_title: params.title ?? "",
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row || row.ok !== true) {
    return { ok: false, error: typeof row?.error === "string" ? row.error : "Could not update post" };
  }

  revalidatePath(`/classes/${params.classId}/feed`);
  return { ok: true };
}

export async function publishClassPostAction(params: {
  organizationId: string;
  classId: string;
  postId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok || !ctx.supabase || !ctx.userId) return { ok: false, error: "Unauthorized" };

  const role = await resolveClassFeedRole(ctx.supabase, params.organizationId, params.classId, ctx.userId);
  if (role !== "lead" && role !== "co_teacher") {
    return { ok: false, error: "Only lead teachers and co-teachers can publish." };
  }

  const { data, error } = await ctx.supabase.rpc("publish_class_post", { p_post_id: params.postId });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row || row.ok !== true) {
    return { ok: false, error: typeof row?.error === "string" ? row.error : "Could not publish post" };
  }

  revalidatePath(`/classes/${params.classId}/feed`);
  revalidatePath("/parent/pulse");
  return { ok: true };
}

export async function archiveClassPostAction(params: {
  organizationId: string;
  classId: string;
  postId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok || !ctx.supabase || !ctx.userId) return { ok: false, error: "Unauthorized" };

  const role = await resolveClassFeedRole(ctx.supabase, params.organizationId, params.classId, ctx.userId);
  if (role !== "lead" && role !== "co_teacher") {
    return { ok: false, error: "Only lead teachers and co-teachers can archive." };
  }

  const { data, error } = await ctx.supabase.rpc("archive_class_post", { p_post_id: params.postId });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row || row.ok !== true) {
    return { ok: false, error: typeof row?.error === "string" ? row.error : "Could not archive post" };
  }

  revalidatePath(`/classes/${params.classId}/feed`);
  return { ok: true };
}

export async function addStudentTagToClassPostAction(params: {
  organizationId: string;
  classId: string;
  postId: string;
  studentId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok || !ctx.supabase || !ctx.userId) return { ok: false, error: "Unauthorized" };

  const role = await resolveClassFeedRole(ctx.supabase, params.organizationId, params.classId, ctx.userId);
  if (role === "none") return { ok: false, error: "You do not have class feed access." };

  const { error } = await ctx.supabase.from("class_post_students").insert({
    organization_id: params.organizationId,
    post_id: params.postId,
    student_id: params.studentId,
  });
  if (error && error.code !== "23505") return { ok: false, error: error.message };

  revalidatePath(`/classes/${params.classId}/feed`);
  return { ok: true };
}

export async function addTagToClassPostAction(params: {
  organizationId: string;
  classId: string;
  postId: string;
  tag: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok || !ctx.supabase || !ctx.userId) return { ok: false, error: "Unauthorized" };

  const role = await resolveClassFeedRole(ctx.supabase, params.organizationId, params.classId, ctx.userId);
  if (role === "none") return { ok: false, error: "You do not have class feed access." };

  const trimmed = params.tag.trim();
  if (!trimmed) return { ok: false, error: "Tag cannot be empty." };

  const { error } = await ctx.supabase.from("class_post_tags").insert({
    organization_id: params.organizationId,
    post_id: params.postId,
    tag: trimmed,
  });
  if (error && error.code !== "23505") return { ok: false, error: error.message };

  revalidatePath(`/classes/${params.classId}/feed`);
  return { ok: true };
}

export async function uploadClassPostMediaAction(params: {
  organizationId: string;
  classId: string;
  postId: string;
  file: File;
}): Promise<{ ok: true; storagePath: string } | { ok: false; error: string }> {
  const ctx = await requireTeacherOrg(params.organizationId);
  if (!ctx.ok || !ctx.supabase || !ctx.userId) return { ok: false, error: "Unauthorized" };

  const role = await resolveClassFeedRole(ctx.supabase, params.organizationId, params.classId, ctx.userId);
  if (role === "none") return { ok: false, error: "You do not have class feed access." };

  const ext = params.file.name.includes(".") ? params.file.name.split(".").pop() : "bin";
  const storagePath = `${params.organizationId}/${params.classId}/${params.postId}/${Date.now()}-${randomUUID()}.${ext}`;
  const { error: upErr } = await ctx.supabase.storage.from("class-media").upload(storagePath, params.file, {
    upsert: false,
    contentType: params.file.type || "application/octet-stream",
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: mediaErr } = await ctx.supabase.from("class_post_media").insert({
    organization_id: params.organizationId,
    post_id: params.postId,
    storage_path: storagePath,
    mime_type: params.file.type || null,
    created_by: ctx.userId,
  });
  if (mediaErr) return { ok: false, error: mediaErr.message };

  revalidatePath(`/classes/${params.classId}/feed`);
  return { ok: true, storagePath };
}
