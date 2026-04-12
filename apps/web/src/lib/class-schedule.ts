import { addDays, addMonths, addYears, eachDayOfInterval, format, subDays } from "date-fns";
import type { ClassRoom, ClassScheduleSlot, WeeklyRepeatRule } from "@/lib/tracker-types";

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

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Calendar YYYY-MM-DD in the runtime's local timezone for a schedule instant.
 * Use this (not `toISOString().slice(0, 10)`) for `session_date` / deep links so evening classes
 * stay on the correct local class day instead of shifting to the next UTC day.
 */
export function sessionDateFromScheduleInstant(startsAt: string | Date): string {
  const d = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  if (Number.isNaN(+d)) return "";
  return localDateKey(d);
}

/** Wall-clock time on a given calendar day in the local timezone. */
export function startsAtForDayAndTimeLocal(day: Date, timeLocal: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeLocal.trim());
  if (!m) return Number.NaN;
  const h = Math.min(23, parseInt(m[1], 10));
  const min = Math.min(59, parseInt(m[2], 10));
  return +new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, min, 0, 0);
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
): number[] {
  if (!validWeeklyRule(rule)) return [];
  const daysSet = new Set(rule.weekdays.filter((d) => d >= 0 && d <= 6));
  if (daysSet.size === 0) return [];
  const [y, m, d] = rule.repeatUntil.split("-").map(Number);
  const untilEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
  const end = new Date(Math.min(rangeEnd.getTime(), untilEnd.getTime()));
  const rangeDayStart = new Date(
    rangeStart.getFullYear(),
    rangeStart.getMonth(),
    rangeStart.getDate(),
    0,
    0,
    0,
    0,
  );
  let start = rangeDayStart;
  const fromRaw = rule.repeatFrom?.trim();
  if (fromRaw && isValidRepeatUntilDate(fromRaw)) {
    const [yf, mf, df] = fromRaw.split("-").map(Number);
    const fromStart = new Date(yf, mf - 1, df, 0, 0, 0, 0);
    if (fromStart > start) start = fromStart;
  }
  if (end < start) return [];
  return eachDayOfInterval({ start, end })
    .filter((day) => daysSet.has(day.getDay()))
    .filter((day) => localDateKey(day) <= rule.repeatUntil)
    .map((day) => startsAtForDayAndTimeLocal(day, rule.timeLocal))
    .filter((t) => !Number.isNaN(t));
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

function finalizeRoom(c: ClassRoom): ClassRoom {
  const updatedAt = new Date().toISOString();
  const next = { ...c, updatedAt };
  return { ...next, nextSessionAt: recomputeNextSessionAt(next) };
}

export function recomputeNextSessionAt(classRoom: ClassRoom): string {
  const oneOffMs = readOneOffStarts(classRoom)
    .map((iso) => +new Date(iso))
    .filter((t) => !Number.isNaN(t));
  const now = new Date();
  const nowMs = now.getTime();
  const cap = addMonths(now, 18);
  const weeklyMs: number[] = [];
  for (const rule of getWeeklyRulesFromClass(classRoom)) {
    if (!isValidRepeatUntilDate(rule.repeatUntil)) continue;
    const [y, m, d] = rule.repeatUntil.split("-").map(Number);
    const untilEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
    const end = untilEnd < cap ? untilEnd : cap;
    if (end < now) continue;
    weeklyMs.push(...expandWeeklyRuleToTimestamps(rule, now, end));
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

export function withScheduleSlots(classRoom: ClassRoom, slots: ClassScheduleSlot[]): ClassRoom {
  const updatedAt = new Date().toISOString();
  const next = { ...classRoom, scheduleSlots: slots, updatedAt };
  return { ...next, nextSessionAt: recomputeNextSessionAt(next) };
}

export function addWeeklyRuleToClass(classRoom: ClassRoom, rule: WeeklyRepeatRule): ClassRoom {
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
  return finalizeRoom({
    ...classRoom,
    weeklyRepeatRules: nextRules,
    weeklyRepeat: undefined,
  });
}

export function removeWeeklyRuleFromClass(classRoom: ClassRoom, ruleId: string): ClassRoom {
  const hasExplicit = Array.isArray(classRoom.weeklyRepeatRules) && classRoom.weeklyRepeatRules.length > 0;
  if (hasExplicit) {
    const next = (classRoom.weeklyRepeatRules ?? []).filter((r) => r.id !== ruleId);
    return finalizeRoom({
      ...classRoom,
      weeklyRepeatRules: next.length ? next : undefined,
      weeklyRepeat: undefined,
    });
  }
  if (classRoom.weeklyRepeat && ruleId.startsWith("wrr_legacy_")) {
    return finalizeRoom({
      ...classRoom,
      weeklyRepeat: undefined,
      weeklyRepeatRules: undefined,
    });
  }
  return classRoom;
}

export type ScheduleEvent = {
  classId: string;
  className: string;
  slotId: string;
  startsAt: string;
};

export function getScheduleEvents(classes: ClassRoom[], rangeStart: Date, rangeEnd: Date): ScheduleEvent[] {
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
      const stamps = expandWeeklyRuleToTimestamps(rule, rangeStart, rangeEnd);
      for (const ms of stamps) {
        const d = new Date(ms);
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, "0");
        const da = String(d.getDate()).padStart(2, "0");
        events.push({
          classId: c.id,
          className: c.name,
          slotId: `weekly_${c.id}_${rule.id}_${y}-${mo}-${da}`,
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
 * Pick the best schedule row for "take attendance now": next upcoming in-window, else most recent past in range.
 */
export function pickPrimaryAttendanceOccurrence(classRoom: ClassRoom, now: Date = new Date()): ScheduleEvent | null {
  const start = subDays(now, 7);
  const end = addDays(now, 21);
  const events = getScheduleEvents([classRoom], start, end).filter((e) => e.classId === classRoom.id);
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
