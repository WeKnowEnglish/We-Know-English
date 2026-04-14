import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Fallback when an organization has no `schedule_timezone` or it is invalid.
 * Override: `NEXT_PUBLIC_SCHEDULE_TIMEZONE` or `SCHEDULE_TIMEZONE` (e.g. `Asia/Bangkok`).
 */
export function getEnvScheduleTimeZone(): string {
  const v =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SCHEDULE_TIMEZONE?.trim()) ||
    (typeof process !== "undefined" && process.env?.SCHEDULE_TIMEZONE?.trim()) ||
    "";
  return v.length > 0 ? v : "Asia/Bangkok";
}

/** @deprecated use getEnvScheduleTimeZone */
export function getScheduleTimeZone(): string {
  return getEnvScheduleTimeZone();
}

function isLikelyIanaTimeZoneId(s: string): boolean {
  return /^[A-Za-z0-9_/+\-]{3,64}$/.test(s);
}

/** Prefer `organizations.schedule_timezone`; fall back to env default. */
export function resolveScheduleTimeZone(organizationScheduleTimezone?: string | null): string {
  const raw = typeof organizationScheduleTimezone === "string" ? organizationScheduleTimezone.trim() : "";
  if (raw.length > 0 && isLikelyIanaTimeZoneId(raw)) return raw;
  return getEnvScheduleTimeZone();
}

/** Calendar YYYY-MM-DD for an instant, in the schedule zone (not the runtime's local zone). */
export function calendarYmdInScheduleZone(isoOrDate: string | Date, tz = getEnvScheduleTimeZone()): string {
  return formatInTimeZone(typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate, tz, "yyyy-MM-dd");
}

/** UTC instant for a calendar day at HH:mm wall time in the schedule zone. */
export function zonedWallClockToUtcMillis(
  ymd: string,
  timeLocal: string,
  tz: string = getEnvScheduleTimeZone(),
): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeLocal.trim());
  if (!m) return Number.NaN;
  const h = Math.min(23, parseInt(m[1], 10));
  const min = Math.min(59, parseInt(m[2], 10));
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3) return Number.NaN;
  const [y, mo, day] = parts;
  if (!y || !mo || !day) return Number.NaN;
  const naive = new Date(y, mo - 1, day, h, min, 0, 0);
  return +fromZonedTime(naive, tz);
}

function addOneCalendarDayYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + 86400000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Last millisecond of Y-M-D wall calendar in `tz` (for range upper bounds). */
export function endOfCalendarDayInZone(ymd: string, tz: string = getEnvScheduleTimeZone()): Date {
  const nextYmd = addOneCalendarDayYmd(ymd);
  const nextMidnight = zonedWallClockToUtcMillis(nextYmd, "00:00", tz);
  return new Date(nextMidnight - 1);
}

/** Inclusive Y-M-D strings from start to end (Gregorian), one step per day — independent of runtime TZ. */
export function eachYmdBetweenInclusive(fromYmd: string, toYmd: string): string[] {
  if (fromYmd > toYmd) return [];
  const out: string[] = [];
  let cur = fromYmd;
  while (cur <= toYmd) {
    out.push(cur);
    cur = addOneCalendarDayYmd(cur);
  }
  return out;
}

/** JavaScript weekday 0–6 (Sun–Sat) for a calendar date (timezone-independent). */
export function utcWeekdayFromYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}
