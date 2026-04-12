"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { WKE_ACTIVE_ORG_COOKIE } from "@/lib/active-org-cookie";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { supabase: null, user: null as { id: string } | null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user: user ? { id: user.id } : null };
}

export async function createOrganization(name: string): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required" };

  const { supabase, user } = await requireUser();
  if (!supabase || !user) return { ok: false, error: "Not signed in" };

  const { data, error } = await supabase.rpc("create_organization", { org_name: trimmed });
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create organization" };
  }

  const organizationId = data as string;
  const cookieStore = await cookies();
  cookieStore.set(WKE_ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  await supabase.from("profiles").update({ last_active_organization_id: organizationId }).eq("id", user.id);

  revalidatePath("/");
  revalidatePath("/onboarding");
  revalidatePath("/organizations");
  return { ok: true, organizationId };
}

export async function setActiveOrganization(organizationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return { ok: false, error: "Not signed in" };

  const { data } = await supabase
    .from("organization_members")
    .select("id")
    .eq("profile_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) return { ok: false, error: "You are not a member of that organization" };

  const cookieStore = await cookies();
  cookieStore.set(WKE_ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  await supabase.from("profiles").update({ last_active_organization_id: organizationId }).eq("id", user.id);

  revalidatePath("/");
  revalidatePath("/onboarding");
  revalidatePath("/students");
  revalidatePath("/attendance");
  revalidatePath("/schedule");
  revalidatePath("/organizations");
  return { ok: true };
}

export type OrganizationDirectoryRow = { id: string; name: string };

export async function searchOrganizationsForTeachersAction(
  query: string,
): Promise<{ ok: true; rows: OrganizationDirectoryRow[] } | { ok: false; error: string }> {
  const { supabase, user } = await requireUser();
  if (!supabase || !user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase.from("profiles").select("app_role").eq("id", user.id).maybeSingle();
  if (profile?.app_role !== "teacher") {
    return { ok: false, error: "Only teachers can search the organization directory." };
  }

  const { data, error } = await supabase.rpc("search_organizations_for_teachers", {
    p_query: query.trim(),
    p_limit: 50,
  });
  if (error) return { ok: false, error: error.message };

  const rows: OrganizationDirectoryRow[] = [];
  if (Array.isArray(data)) {
    for (const row of data as { id?: string; name?: string }[]) {
      if (row?.id && row?.name) rows.push({ id: row.id, name: row.name });
    }
  }
  return { ok: true, rows };
}

export type RequestJoinOrganizationResult =
  | { ok: true; kind: "request_sent" | "already_pending" | "already_member"; organizationId: string }
  | { ok: false; error: string };

export async function requestJoinOrganizationAction(organizationId: string): Promise<RequestJoinOrganizationResult> {
  const trimmed = organizationId.trim();
  if (!trimmed) return { ok: false, error: "Organization is required" };

  const { supabase, user } = await requireUser();
  if (!supabase || !user) return { ok: false, error: "Not signed in" };

  const { data: profile } = await supabase.from("profiles").select("app_role").eq("id", user.id).maybeSingle();
  if (profile?.app_role !== "teacher") {
    return { ok: false, error: "Only teachers can request to join an organization." };
  }

  const { data, error } = await supabase.rpc("request_join_organization_as_teacher", { p_organization_id: trimmed });
  if (error) return { ok: false, error: error.message };

  const row = data as { ok?: boolean; error?: string; kind?: string; organization_id?: string } | null;
  if (!row || row.ok !== true) {
    return { ok: false, error: typeof row?.error === "string" ? row.error : "Could not submit join request" };
  }

  const kindRaw = row.kind;
  const kind =
    kindRaw === "already_member" || kindRaw === "already_pending" || kindRaw === "request_sent"
      ? kindRaw
      : "request_sent";
  const orgId = typeof row.organization_id === "string" ? row.organization_id : trimmed;

  revalidatePath("/");
  revalidatePath("/onboarding");
  revalidatePath("/organizations");
  revalidatePath(`/organizations/${orgId}`);
  return { ok: true, kind, organizationId: orgId };
}

export async function approveJoinRequestAction(
  requestId: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  const trimmed = requestId.trim();
  if (!trimmed) return { ok: false, error: "Request is required" };

  const { supabase, user } = await requireUser();
  if (!supabase || !user) return { ok: false, error: "Not signed in" };

  const { data, error } = await supabase.rpc("approve_organization_join_request", { p_request_id: trimmed });
  if (error) return { ok: false, error: error.message };

  const row = data as { ok?: boolean; error?: string; organization_id?: string } | null;
  if (!row || row.ok !== true) {
    return { ok: false, error: typeof row?.error === "string" ? row.error : "Could not approve request" };
  }

  const orgId = typeof row.organization_id === "string" ? row.organization_id : "";
  revalidatePath("/");
  revalidatePath("/onboarding");
  revalidatePath("/organizations");
  if (orgId) revalidatePath(`/organizations/${orgId}`);
  revalidatePath("/students");
  revalidatePath("/attendance");
  revalidatePath("/schedule");
  return { ok: true, organizationId: orgId };
}

export async function rejectJoinRequestAction(
  requestId: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  const trimmed = requestId.trim();
  if (!trimmed) return { ok: false, error: "Request is required" };

  const { supabase, user } = await requireUser();
  if (!supabase || !user) return { ok: false, error: "Not signed in" };

  const { data, error } = await supabase.rpc("reject_organization_join_request", { p_request_id: trimmed });
  if (error) return { ok: false, error: error.message };

  const row = data as { ok?: boolean; error?: string; organization_id?: string } | null;
  if (!row || row.ok !== true) {
    return { ok: false, error: typeof row?.error === "string" ? row.error : "Could not reject request" };
  }

  const orgId = typeof row.organization_id === "string" ? row.organization_id : "";
  revalidatePath("/organizations");
  if (orgId) revalidatePath(`/organizations/${orgId}`);
  return { ok: true, organizationId: orgId };
}
