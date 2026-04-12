import type { AttendanceStatus } from "@/lib/tracker-types";

export function isSessionUuid(s: string | null | undefined): boolean {
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** UI cycle order when tapping a student tile */
export const ATTENDANCE_STATUS_CYCLE: AttendanceStatus[] = [
  "present",
  "late",
  "absent_unexcused",
  "absent_excused",
];

export function normalizeAttendanceStatus(raw: string | undefined | null): AttendanceStatus {
  const v = (raw ?? "").toLowerCase().trim();
  if (v === "absent" || v === "absent_unexcused") return "absent_unexcused";
  if (v === "absent_excused") return "absent_excused";
  if (v === "late") return "late";
  return "present";
}

/** Billable for per-session tuition: present, late, unexcused absence (not excused absence). */
export function isBillableAttendanceStatus(status: AttendanceStatus): boolean {
  return status === "present" || status === "late" || status === "absent_unexcused";
}

/** Stable string for comparing roster attendance (sorted student ids). */
export function rosterAttendanceSnapshot(
  attendance: Record<string, AttendanceStatus>,
  rosterStudentIds: string[],
): string {
  const ids = [...rosterStudentIds].sort();
  return ids.map((id) => `${id}:${normalizeAttendanceStatus(attendance[id] ?? "present")}`).join("|");
}

/** Same-origin path + query only; blocks open redirects. */
export function parseSafeReturnTo(input: string | null | undefined): string | null {
  if (input == null || typeof input !== "string") return null;
  const t = input.trim();
  if (t.length === 0 || t.length > 256) return null;
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  if (t.includes("://") || t.includes("\\") || t.includes("@")) return null;
  const [pathAndQuery] = t.split("#");
  if (!/^\/[A-Za-z0-9/._\-?&=%]*$/.test(pathAndQuery)) return null;
  return pathAndQuery;
}

export function returnToDestination(returnTo: string | null): { href: string; label: string } {
  const defaultDest = { href: "/onboarding", label: "Back to classes" };
  if (!returnTo) return defaultDest;
  const path = (returnTo.split("?")[0] ?? returnTo).split("#")[0] ?? returnTo;
  if (path === "/schedule") return { href: returnTo, label: "Back to schedule" };
  if (path === "/onboarding") return { href: returnTo, label: "Back to classes" };
  if (path.startsWith("/onboarding/")) return { href: returnTo, label: "Back to class" };
  if (path === "/attendance/missed") return { href: returnTo, label: "Back to missed sessions" };
  if (path === "/attendance/report") return { href: returnTo, label: "Back to report" };
  if (path === "/attendance/finalized-by-me") return { href: returnTo, label: "Back to finalized sessions" };
  if (path === "/attendance") return { href: returnTo, label: "Back to attendance" };
  if (path === "/") return { href: returnTo, label: "Back to home" };
  if (path.startsWith("/students")) return { href: returnTo, label: "Back to students" };
  if (path.startsWith("/billing")) return { href: returnTo, label: "Back to billing" };
  return { href: returnTo, label: "Back" };
}

export type BuildAttendanceUrlParams = {
  classId?: string | null;
  sessionId?: string | null;
  occurrenceKey?: string | null;
  sessionDate?: string | null;
  reopen?: boolean | string | null;
  returnTo?: string | null;
};

export function buildAttendanceUrl(params: BuildAttendanceUrlParams): string {
  const q = new URLSearchParams();
  if (params.classId) q.set("classId", params.classId);
  if (params.sessionId) q.set("sessionId", params.sessionId);
  if (params.occurrenceKey) q.set("occurrenceKey", params.occurrenceKey);
  if (params.sessionDate) q.set("sessionDate", params.sessionDate);
  if (params.reopen === true || params.reopen === "1" || params.reopen === "true") q.set("reopen", "1");
  const safe = parseSafeReturnTo(params.returnTo ?? null);
  if (safe) q.set("returnTo", safe);
  const qs = q.toString();
  return qs ? `/attendance?${qs}` : "/attendance";
}
