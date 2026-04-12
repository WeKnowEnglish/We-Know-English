"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildAttendanceUrl, parseSafeReturnTo } from "@/lib/attendance-utils";
import type { MissedAttendanceItem } from "@/lib/tracker-queries";

const DISMISS_KEY = "wke_missed_attendance_dismissed_keys";

function attendanceHrefForItem(it: MissedAttendanceItem, returnTo: string) {
  return buildAttendanceUrl({
    classId: it.classId,
    occurrenceKey: it.occurrenceKey,
    sessionDate: it.sessionDate,
    returnTo,
  });
}

export function MissedAttendanceBanner({ items }: { items: MissedAttendanceItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const attendanceReturnTo = parseSafeReturnTo(pathname) ?? "/attendance";
  const keySignature = useMemo(() => items.map((i) => i.occurrenceKey).sort().join("|"), [items]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (items.length === 0) {
      setOpen(false);
      return;
    }
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      const prev = raw ? (JSON.parse(raw) as string[]) : [];
      if (prev.includes(keySignature)) {
        setOpen(false);
        return;
      }
    } catch {
      /* ignore */
    }
    setOpen(true);
  }, [items, keySignature]);

  const dismiss = () => {
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      const prev = raw ? (JSON.parse(raw) as string[]) : [];
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...prev, keySignature]));
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const takeAttendanceFor = (it: MissedAttendanceItem) => {
    dismiss();
    router.push(attendanceHrefForItem(it, attendanceReturnTo));
  };

  const openFullMissedList = () => {
    dismiss();
    router.push("/attendance/missed");
  };

  if (!open || items.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="missed-att-title"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-destructive/40 bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-6 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="missed-att-title" className="text-lg font-semibold text-destructive">
              Attendance needed
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These class meetings already started but attendance is not finalized yet.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {items.map((it) => (
                <li key={it.occurrenceKey} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <p className="font-medium">{it.className}</p>
                  <p className="text-muted-foreground">
                    {new Date(it.startsAt).toLocaleString()} · session date {it.sessionDate}
                  </p>
                  <Button type="button" variant="default" size="sm" className="mt-2" onClick={() => takeAttendanceFor(it)}>
                    Take attendance
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                onClick={openFullMissedList}
              >
                Open full missed list
              </button>
              <Button type="button" variant="outline" size="sm" onClick={dismiss}>
                Dismiss popup
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
