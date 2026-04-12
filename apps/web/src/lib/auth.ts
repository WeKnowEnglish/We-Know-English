import type { User } from "@supabase/supabase-js";

export type AppRole = "teacher" | "student";

export function parseAppRole(value: unknown): AppRole | null {
  if (value === "teacher" || value === "student") return value;
  return null;
}

export function appRoleFromUser(user: User | null): AppRole | null {
  if (!user) return null;
  return parseAppRole(user.user_metadata?.app_role);
}

/** Tutor tools and billing — not shown to students in nav / blocked in middleware */
export const TEACHER_ROUTE_PREFIXES = [
  "/attendance",
  "/moments",
  "/feed",
  "/onboarding",
  "/billing",
  "/organizations",
  "/students",
] as const;

export function isTeacherRoute(pathname: string): boolean {
  return TEACHER_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
