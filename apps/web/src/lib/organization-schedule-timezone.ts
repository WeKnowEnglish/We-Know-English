import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveScheduleTimeZone } from "@/lib/schedule-timezone";

/** Resolved IANA zone for schedule math; deduped per request. */
export const getScheduleTimezoneForOrganization = cache(async (organizationId: string): Promise<string> => {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return resolveScheduleTimeZone(null);
  const { data, error } = await supabase
    .from("organizations")
    .select("schedule_timezone")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) return resolveScheduleTimeZone(null);
  return resolveScheduleTimeZone((data as { schedule_timezone: string | null }).schedule_timezone);
});
