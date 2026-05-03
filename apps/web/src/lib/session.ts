import type { User } from "@supabase/supabase-js";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { AppRole } from "@/lib/auth";
import { parseAppRole } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SessionInfo = {
  user: User | null;
  appRole: AppRole | null;
};

function isRefreshTokenReuseError(message: string) {
  return (
    message.includes("Already Used") ||
    message.includes("Invalid Refresh Token") ||
    message.includes("Refresh Token Not Found")
  );
}

/** One Supabase `getUser()` per request — avoids refresh races when layout + page both call session. */
export const getSession = cache(async function getSession(): Promise<SessionInfo> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { user: null, appRole: null };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error && isRefreshTokenReuseError(error.message)) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    return { user: null, appRole: null };
  }

  if (error || !user) {
    return { user: null, appRole: null };
  }

  await supabase.rpc("ensure_my_profile");

  const { data: profile } = await supabase.from("profiles").select("app_role").eq("id", user.id).maybeSingle();

  let appRole = parseAppRole(profile?.app_role);
  if (!appRole) {
    appRole = parseAppRole(user.user_metadata?.app_role) ?? "teacher";
  }

  return { user, appRole };
});

/**
 * Teacher-only RSC entry: unauthenticated users → login; students → home.
 * Returns narrowed session for type-safe `user.id` after the call.
 */
export function requireTeacherSession(session: SessionInfo): { user: User; appRole: "teacher" } {
  const { user, appRole } = session;
  if (!user) redirect("/login");
  if (appRole === "student") redirect("/");
  if (appRole !== "teacher") redirect("/login");
  return { user, appRole: "teacher" };
}
