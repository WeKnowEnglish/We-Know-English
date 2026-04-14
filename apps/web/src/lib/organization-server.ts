import { cookies } from "next/headers";
import type { AppRole } from "@/lib/auth";
import { WKE_ACTIVE_ORG_COOKIE } from "@/lib/active-org-cookie";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveScheduleTimeZone } from "@/lib/schedule-timezone";

export type OrgSummary = { id: string; name: string; scheduleTimezone: string };

export type OrgWithRole = OrgSummary & { role: "owner" | "staff" | "client" };

export type PendingJoinRequestRow = {
  request_id: string;
  profile_id: string;
  requester_full_name: string;
  requester_email: string;
  created_at: string;
};

export type OrganizationShellContext = {
  organizations: OrgSummary[];
  activeOrganizationId: string | null;
  /** Shown in the app header when the user is managing an organization. */
  headerTitle: string;
};

export async function getOrganizationShellContext(params: {
  userId: string | null;
  appRole: AppRole | null;
}): Promise<OrganizationShellContext> {
  if (!params.userId || params.appRole === "student") {
    return {
      organizations: [],
      activeOrganizationId: null,
      headerTitle: "Student",
    };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      organizations: [],
      activeOrganizationId: null,
      headerTitle: "WKE Tracker",
    };
  }

  type MemberRow = {
    organization_id: string;
    organizations:
      | { id: string; name: string; schedule_timezone: string | null }
      | { id: string; name: string; schedule_timezone: string | null }[]
      | null;
  };

  const { data: rows, error } = await supabase
    .from("organization_members")
    .select("organization_id, organizations ( id, name, schedule_timezone )")
    .eq("profile_id", params.userId);

  if (error || !rows?.length) {
    return {
      organizations: [],
      activeOrganizationId: null,
      headerTitle: "WKE Tracker",
    };
  }

  const organizations: OrgSummary[] = (rows as MemberRow[])
    .map((r) => {
      const o = r.organizations;
      const org = Array.isArray(o) ? o[0] : o;
      if (org?.id && org?.name) {
        return {
          id: org.id,
          name: org.name,
          scheduleTimezone: resolveScheduleTimeZone(org.schedule_timezone),
        };
      }
      return {
        id: r.organization_id,
        name: "Organization",
        scheduleTimezone: resolveScheduleTimeZone(null),
      };
    })
    .filter(Boolean);

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("last_active_organization_id")
    .eq("id", params.userId)
    .maybeSingle();

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(WKE_ACTIVE_ORG_COOKIE)?.value ?? null;
  let activeId = fromCookie ?? profileRow?.last_active_organization_id ?? null;

  if (activeId && !organizations.some((o) => o.id === activeId)) {
    activeId = null;
  }
  if (!activeId && organizations.length > 0) {
    activeId = organizations[0].id;
  }

  const active = organizations.find((o) => o.id === activeId) ?? null;
  const headerTitle = active?.name ?? (organizations[0]?.name ?? "WKE Tracker");

  return {
    organizations,
    activeOrganizationId: activeId,
    headerTitle,
  };
}

/** Teacher's organizations with membership role (for directory links). */
export async function fetchTeacherOrganizationsWithRoles(userId: string): Promise<OrgWithRole[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organization_id, organizations ( id, name, schedule_timezone )")
    .eq("profile_id", userId);

  if (error || !data?.length) return [];

  const out: OrgWithRole[] = [];
  for (const row of data as {
    role: string;
    organization_id: string;
    organizations:
      | { id: string; name: string; schedule_timezone: string | null }
      | { id: string; name: string; schedule_timezone: string | null }[]
      | null;
  }[]) {
    const r = row.role;
    if (r !== "owner" && r !== "staff" && r !== "client") continue;
    const o = row.organizations;
    const org = Array.isArray(o) ? o[0] : o;
    const name = org?.name ?? "Organization";
    const id = org?.id ?? row.organization_id;
    const scheduleTimezone = resolveScheduleTimeZone(org?.schedule_timezone ?? null);
    out.push({ id, name, scheduleTimezone, role: r });
  }
  return out;
}

export async function fetchPendingJoinRequestOrgIds(userId: string): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("organization_teacher_join_requests")
    .select("organization_id")
    .eq("profile_id", userId)
    .eq("status", "pending");
  if (error || !data) return [];
  return [...new Set(data.map((r) => r.organization_id as string))];
}

export async function fetchOrgMembershipRole(
  userId: string,
  organizationId: string,
): Promise<"owner" | "staff" | "client" | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data?.role) return null;
  const r = data.role as string;
  if (r === "owner" || r === "staff" || r === "client") return r;
  return null;
}

export async function fetchOrganizationByIdForMember(
  organizationId: string,
  memberUserId: string,
): Promise<{ id: string; name: string; created_at: string; scheduleTimezone: string } | null> {
  const role = await fetchOrgMembershipRole(memberUserId, organizationId);
  if (!role) return null;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, created_at, schedule_timezone")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; name: string; created_at: string; schedule_timezone: string | null };
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    scheduleTimezone: resolveScheduleTimeZone(row.schedule_timezone),
  };
}

export async function getPendingJoinRequestsForOrg(organizationId: string): Promise<PendingJoinRequestRow[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("list_pending_join_requests_for_org", {
    p_organization_id: organizationId,
  });
  if (error || !data || !Array.isArray(data)) return [];
  const rows: PendingJoinRequestRow[] = [];
  for (const raw of data as Record<string, unknown>[]) {
    const request_id = raw.request_id ?? raw.requestId;
    const profile_id = raw.profile_id ?? raw.profileId;
    if (typeof request_id !== "string" || typeof profile_id !== "string") continue;
    rows.push({
      request_id,
      profile_id,
      requester_full_name: typeof raw.requester_full_name === "string" ? raw.requester_full_name : "",
      requester_email: typeof raw.requester_email === "string" ? raw.requester_email : "",
      created_at: typeof raw.created_at === "string" ? raw.created_at : String(raw.created_at ?? ""),
    });
  }
  return rows;
}
