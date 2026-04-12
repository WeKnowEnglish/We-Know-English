/** Client-only preferences for class tiles (not authoritative data). */

const CLASS_ACCESS_TIMES_KEY = "wke:class_access_times";

function readAccessTimes(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(CLASS_ACCESS_TIMES_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function touchClassAccess(classId: string) {
  if (typeof window === "undefined" || !classId) return;
  const times = readAccessTimes();
  times[classId] = new Date().toISOString();
  window.localStorage.setItem(CLASS_ACCESS_TIMES_KEY, JSON.stringify(times));
}

export function removeClassAccess(classId: string) {
  if (typeof window === "undefined" || !classId) return;
  const times = readAccessTimes();
  if (!(classId in times)) return;
  delete times[classId];
  window.localStorage.setItem(CLASS_ACCESS_TIMES_KEY, JSON.stringify(times));
}
