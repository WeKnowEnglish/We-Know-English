import { addDays, addMonths, addYears, format, subDays } from "date-fns";
import type { ClassRoom, ClassScheduleSlot, WeeklyRepeatRule } from "@/lib/tracker-types";
import {
  calendarYmdInScheduleZone,
  eachYmdBetweenInclusive,
  endOfCalendarDayInZone,
  getEnvScheduleTimeZone,
  utcWeekdayFromYmd,
  zonedWallClockToUtcMillis,
} from "@/lib/schedule-timezone";

export function makeSlotId() {
  return `slot_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Parsed next session start, or null when none is set (including empty string in settings). */
export function nextSessionInstantOrNull(classRoom: ClassRoom): Date | null {
  const raw = classRoom.nextSessionAt?.trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function makeWeeklyRuleId() {
  return `wrr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** One-off session starts only (no synthetic legacy slot). Mirrors storage semantics for recompute. */
function readOneOffStarts(classRoom: ClassRoom): string[] {
  const raw = classRoom.scheduleSlots;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter((s) => s?.startsAt).map((s) => s.startsAt);
  }
  if (Array.isArray(raw) && raw.length === 0) return [];
  if (classRoom.nextSessionAt) return [classRoom.nextSessionAt];
  return [];
}

/**
 * Calendar YYYY-MM-DD in the organization's schedule timezone (or env fallback).
 * Use this (not `toISOString().slice(0, 10)` or runtime local getters) for `session_date` / deep links
 * so evening classes stay on the correct class day on servers in UTC (e.g. Vercel).
 */
export function sessionDateFromScheduleInstant(
  startsAt: string | Date,
  scheduleTimeZone: string = getEnvScheduleTimeZone(),
): string {
  const d = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  if (Number.isNaN(+d)) return "";
  return calendarYmdInScheduleZone(d, scheduleTimeZone);
}

export function isValidWeeklyTimeLocal(value: string): boolean {
  return /^(\d{1,2}):(\d{2})$/.test(value.trim());
}

export function isValidRepeatUntilDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function padTimeLocal(timeLocal: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeLocal.trim());
  if (!m) return timeLocal.trim();
  const h = Math.min(23, parseInt(m[1], 10));
  const min = Math.min(59, parseInt(m[2], 10));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function validWeeklyRule(rule: WeeklyRepeatRule): boolean {
  if (!rule?.id || !rule.weekdays?.length || !isValidWeeklyTimeLocal(rule.timeLocal)) return false;
  if (!isValidRepeatUntilDate(rule.repeatUntil)) return false;
  const from = rule.repeatFrom?.trim();
  if (from) {
    if (!isValidRepeatUntilDate(from)) return false;
    if (from > rule.repeatUntil.trim()) return false;
  }
  return true;
}

function defaultRepeatUntilDate(): string {
  return format(addYears(new Date(), 2), "yyyy-MM-dd");
}

function legacyRuleFromClass(c: ClassRoom): WeeklyRepeatRule | null {
  const w = c.weeklyRepeat;
  if (!w?.weekdays?.length || !isValidWeeklyTimeLocal(w.timeLocal)) return null;
  return {
    id: `wrr_legacy_${c.id}`,
    weekdays: [...new Set(w.weekdays.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b),
    timeLocal: padTimeLocal(w.timeLocal),
    repeatUntil: defaultRepeatUntilDate(),
  };
}

/** Rules for calendar / recompute: explicit `weeklyRepeatRules`, else one synthetic rule from legacy `weeklyRepeat`. */
export function getWeeklyRulesFromClass(classRoom: ClassRoom): WeeklyRepeatRule[] {
  const explicit = classRoom.weeklyRepeatRules;
  if (Array.isArray(explicit) && explicit.length > 0) {
    return explicit.filter(validWeeklyRule);
  }
  const legacy = legacyRuleFromClass(classRoom);
  return legacy ? [legacy] : [];
}

export function expandWeeklyRuleToTimestamps(
  rule: WeeklyRepeatRule,
  rangeStart: Date,
  rangeEnd: Date,
  scheduleTimeZone: string = getEnvScheduleTimeZone(),
): number[] {
  const tz = scheduleTimeZone;
  if (!validWeeklyRule(rule)) return [];
  const daysSet = new Set(rule.weekdays.filter((d) => d >= 0 && d <= 6));
  if (daysSet.size === 0) return [];

  let startYmd = calendarYmdInScheduleZone(rangeStart, tz);
  let endYmd = calendarYmdInScheduleZone(rangeEnd, tz);
  const until = rule.repeatUntil.trim();
  if (endYmd > until) endYmd = until;

  const fromRaw = rule.repeatFrom?.trim();
  if (fromRaw && isValidRepeatUntilDate(fromRaw) && fromRaw > startYmd) {
    startYmd = fromRaw;
  }

  if (startYmd > endYmd) return [];

  const stamps: number[] = [];
  for (const ymd of eachYmdBetweenInclusive(startYmd, endYmd)) {
    if (ymd > until) break;
    if (!daysSet.has(utcWeekdayFromYmd(ymd))) continue;
    const ms = zonedWallClockToUtcMillis(ymd, rule.timeLocal, tz);
    if (!Number.isNaN(ms)) stamps.push(ms);
  }
  return stamps;
}

/** If `scheduleSlots` was never stored, surface legacy `nextSessionAt` as one slot. Explicit `[]` stays empty. */
export function normalizeClassForRead(classRoom: ClassRoom): ClassRoom {
  const raw = classRoom.scheduleSlots;
  if (Array.isArray(raw) && raw.length > 0) {
    return { ...classRoom, scheduleSlots: raw.filter((s) => s?.id && s?.startsAt) };
  }
  if (Array.isArray(raw)) {
    return { ...classRoom, scheduleSlots: [] };
  }
  if (classRoom.nextSessionAt) {
    return {
      ...classRoom,
      scheduleSlots: [{ id: `slot_legacy_${classRoom.id}`, startsAt: classRoom.nextSessionAt }],
    };
  }
  return { ...classRoom, scheduleSlots: [] };
}

/** Whether the class still has any calendar source (slots, weekly pattern, or legacy next session). */
export function classHasDefinedSchedule(classRoom: ClassRoom): boolean {
  const n = normalizeClassForRead(classRoom);
  if (Array.isArray(n.scheduleSlots) && n.scheduleSlots.length > 0) return true;
  if (getWeeklyRulesFromClass(n).length > 0) return true;
  if (n.nextSessionAt?.trim()) return true;
  return false;
}

function finalizeRoom(c: ClassRoom, scheduleTimeZone: string): ClassRoom {
  const updatedAt = new Date().toISOString();
  const next = { ...c, updatedAt };
  return { ...next, nextSessionAt: recomputeNextSessionAt(next, scheduleTimeZone) };
}

export function recomputeNextSessionAt(
  classRoom: ClassRoom,
  scheduleTimeZone: string = getEnvScheduleTimeZone(),
): string {
  const oneOffMs = readOneOffStarts(classRoom)
    .map((iso) => +new Date(iso))
    .filter((t) => !Number.isNaN(t));
  const now = new Date();
  const nowMs = now.getTime();
  const cap = addMonths(now, 18);
  const weeklyMs: number[] = [];
  const tz = scheduleTimeZone;
  for (const rule of getWeeklyRulesFromClass(classRoom)) {
    if (!isValidRepeatUntilDate(rule.repeatUntil)) continue;
    const ruleUntilYmd = rule.repeatUntil.trim();
    const capYmd = calendarYmdInScheduleZone(cap, tz);
    const lastYmd = ruleUntilYmd < capYmd ? ruleUntilYmd : capYmd;
    const untilEnd = endOfCalendarDayInZone(lastYmd, tz);
    const end = new Date(Math.min(untilEnd.getTime(), cap.getTime()));
    if (end < now) continue;
    weeklyMs.push(...expandWeeklyRuleToTimestamps(rule, now, end, tz));
  }
  const times = [...oneOffMs, ...weeklyMs];
  if (times.length === 0) {
    return classRoom.nextSessionAt?.trim() ? classRoom.nextSessionAt : "";
  }
  const future = times.filter((t) => t >= nowMs);
  if (future.length > 0) {
    return new Date(Math.min(...future)).toISOString();
  }
  return new Date(Math.min(...times)).toISOString();
}

export function withScheduleSlots(
  classRoom: ClassRoom,
  slots: ClassScheduleSlot[],
  scheduleTimeZone: string = getEnvScheduleTimeZone(),
): ClassRoom {
  const updatedAt = new Date().toISOString();
  const next = { ...classRoom, scheduleSlots: slots, updatedAt };
  return finalizeRoom(next, scheduleTimeZone);
}

export function addWeeklyRuleToClass(
  classRoom: ClassRoom,
  rule: WeeklyRepeatRule,
  scheduleTimeZone: string = getEnvScheduleTimeZone(),
): ClassRoom {
  const fromTrim = rule.repeatFrom?.trim();
  const normalizedRule: WeeklyRepeatRule = {
    ...rule,
    weekdays: [...new Set(rule.weekdays.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b),
    timeLocal: padTimeLocal(rule.timeLocal),
    repeatUntil: rule.repeatUntil.trim(),
    repeatFrom: fromTrim && isValidRepeatUntilDate(fromTrim) ? fromTrim : undefined,
  };
  const hasExplicit = Array.isArray(classRoom.weeklyRepeatRules) && classRoom.weeklyRepeatRules.length > 0;
  let nextRules: WeeklyRepeatRule[];
  if (hasExplicit) {
    nextRules = [...(classRoom.weeklyRepeatRules ?? []).filter(validWeeklyRule), normalizedRule];
  } else if (classRoom.weeklyRepeat) {
    const legacy = legacyRuleFromClass(classRoom);
    nextRules = legacy ? [legacy, normalizedRule] : [normalizedRule];
  } else {
    nextRules = [normalizedRule];
  }
  return finalizeRoom(
    {
      ...classRoom,
      weeklyRepeatRules: nextRules,
      weeklyRepeat: undefined,
    },
    scheduleTimeZone,
  );
}

export function removeWeeklyRuleFromClass(
  classRoom: ClassRoom,
  ruleId: string,
  scheduleTimeZone: string = getEnvScheduleTimeZone(),
): ClassRoom {
  const hasExplicit = Array.isArray(classRoom.weeklyRepeatRules) && classRoom.weeklyRepeatRules.length > 0;
  if (hasExplicit) {
    const next = (classRoom.weeklyRepeatRules ?? []).filter((r) => r.id !== ruleId);
    return finalizeRoom(
      {
        ...classRoom,
        weeklyRepeatRules: next.length ? next : undefined,
        weeklyRepeat: undefined,
      },
      scheduleTimeZone,
    );
  }
  if (classRoom.weeklyRepeat && ruleId.startsWith("wrr_legacy_")) {
    return finalizeRoom(
      {
        ...classRoom,
        weeklyRepeat: undefined,
        weeklyRepeatRules: undefined,
      },
      scheduleTimeZone,
    );
  }
  return classRoom;
}

export type ScheduleEvent = {
  classId: string;
  className: string;
  slotId: string;
  startsAt: string;
};

export function getScheduleEvents(
  classes: ClassRoom[],
  rangeStart: Date,
  rangeEnd: Date,
  scheduleTimeZone: string = getEnvScheduleTimeZone(),
): ScheduleEvent[] {
  const tz = scheduleTimeZone;
  const events: ScheduleEvent[] = [];
  for (const c of classes) {
    const normalized = normalizeClassForRead(c);
    const slots = normalized.scheduleSlots ?? [];
    for (const slot of slots) {
      events.push({
        classId: c.id,
        className: c.name,
        slotId: slot.id,
        startsAt: slot.startsAt,
      });
    }
    for (const rule of getWeeklyRulesFromClass(c)) {
      const stamps = expandWeeklyRuleToTimestamps(rule, rangeStart, rangeEnd, tz);
      for (const ms of stamps) {
        const d = new Date(ms);
        const ymd = calendarYmdInScheduleZone(d, tz);
        events.push({
          classId: c.id,
          className: c.name,
          slotId: `weekly_${c.id}_${rule.id}_${ymd}`,
          startsAt: d.toISOString(),
        });
      }
    }
  }
  return events.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
}

/** Stable key for matching `sessions.occurrence_key` to a calendar slot. */
export function buildOccurrenceKey(classId: string, slotId: string, startsAtIso: string): string {
  const t = new Date(startsAtIso);
  if (Number.isNaN(+t)) return `${classId}|${slotId}|invalid`;
  return `${classId}|${slotId}|${t.toISOString()}`;
}

/** Inverse of `buildOccurrenceKey` for display; returns null if the string is empty or malformed. */
export function parseOccurrenceKey(
  occurrenceKey: string,
): { classId: string; slotId: string; startsAt: Date } | null {
  const k = occurrenceKey?.trim();
  if (!k) return null;
  const first = k.indexOf("|");
  const last = k.lastIndexOf("|");
  if (first < 0 || last <= first) return null;
  const classId = k.slice(0, first);
  const slotId = k.slice(first + 1, last);
  const iso = k.slice(last + 1);
  if (iso === "invalid") return null;
  const startsAt = new Date(iso);
  if (Number.isNaN(+startsAt)) return null;
  return { classId, slotId, startsAt };
}

/**
 * Local calendar day embedded in weekly slot ids (`weekly_<classId>_<ruleId>_YYYY-MM-DD`).
 * Matches the teacher-facing day even when the ISO tail of `occurrence_key` falls on the next UTC/local calendar day.
 */
export function embeddedCalendarDayFromOccurrenceKey(occurrenceKey: string | null | undefined): string | null {
  const k = occurrenceKey?.trim();
  if (!k) return null;
  const first = k.indexOf("|");
  const last = k.lastIndexOf("|");
  if (first < 0 || last <= first) return null;
  const slotId = k.slice(first + 1, last);
  if (!slotId.startsWith("weekly_")) return null;
  const m = /_(\d{4}-\d{2}-\d{2})$/.exec(slotId);
  return m ? m[1] : null;
}

/**
 * Pick the best schedule row for "take attendance now": next upcoming in-window, else most recent past in range.
 */
export function pickPrimaryAttendanceOccurrence(
  classRoom: ClassRoom,
  options?: { now?: Date; scheduleTimeZone?: string },
): ScheduleEvent | null {
  const now = options?.now ?? new Date();
  const tz = options?.scheduleTimeZone ?? getEnvScheduleTimeZone();
  const start = subDays(now, 7);
  const end = addDays(now, 21);
  const events = getScheduleEvents([classRoom], start, end, tz).filter((e) => e.classId === classRoom.id);
  if (events.length === 0) return null;
  const nowMs = now.getTime();
  const upcoming = events
    .filter((e) => +new Date(e.startsAt) >= nowMs)
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  if (upcoming.length > 0) return upcoming[0];
  const past = events
    .filter((e) => +new Date(e.startsAt) <= nowMs)
    .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
  return past[0] ?? null;
}
