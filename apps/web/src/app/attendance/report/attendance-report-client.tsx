"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Download } from "lucide-react";
import { exportAttendanceReportExcelAction } from "@/app/actions/attendance-export";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AttendanceClassSummaryResult,
  AttendanceReportRow,
} from "@/lib/tracker-queries";
import type { ClassRoom } from "@/lib/tracker-types";

type ReportView = "detail" | "summary";

function buildReportQuery(params: {
  dateFrom: string;
  dateTo: string;
  classId: string;
  view: ReportView;
}): string {
  const q = new URLSearchParams();
  q.set("from", params.dateFrom);
  q.set("to", params.dateTo);
  if (params.classId.trim()) q.set("classId", params.classId.trim());
  if (params.view === "summary") q.set("view", "summary");
  return `/attendance/report?${q.toString()}`;
}

export function AttendanceReportClient({
  organizationId,
  initialClasses,
  initialRows,
  initialDateFrom,
  initialDateTo,
  initialClassId,
  initialView,
  initialSummaryResult,
}: {
  organizationId: string;
  initialClasses: ClassRoom[];
  initialRows: AttendanceReportRow[];
  initialDateFrom: string;
  initialDateTo: string;
  initialClassId: string | null;
  initialView: ReportView;
  initialSummaryResult: AttendanceClassSummaryResult | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [classId, setClassId] = useState(initialClassId ?? "");

  const view: ReportView = initialView === "summary" ? "summary" : "detail";
  const rows = useMemo(() => initialRows, [initialRows]);
  const summary = initialSummaryResult;

  const navigateWithFilters = (nextView: ReportView) => {
    router.push(
      buildReportQuery({
        dateFrom,
        dateTo,
        classId,
        view: nextView,
      }),
    );
    router.refresh();
  };

  const applyFilters = () => {
    router.push(
      buildReportQuery({
        dateFrom,
        dateTo,
        classId,
        view,
      }),
    );
    router.refresh();
  };

  const downloadExcel = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await exportAttendanceReportExcelAction({
        organizationId,
        dateFrom,
        dateTo,
        classId: classId.trim() || null,
        view: "detail",
      });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const downloadSummaryExcel = () => {
    if (!classId.trim()) return;
    setMessage(null);
    startTransition(async () => {
      const res = await exportAttendanceReportExcelAction({
        organizationId,
        dateFrom,
        dateTo,
        classId: classId.trim(),
        view: "summary",
      });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attendance report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Detail rows for export and audit, or a class summary with per-student counts for the date range.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={view === "detail" ? "default" : "outline"}
          onClick={() => navigateWithFilters("detail")}
        >
          Detail rows
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === "summary" ? "default" : "outline"}
          onClick={() => navigateWithFilters("summary")}
        >
          Class summary
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Rows use each session’s stored calendar date. With no From date in the URL, the table defaults to the last
            365 days through To—set From/To manually if you need a wider range. Class summary requires a single class.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-muted-foreground">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 flex h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 flex h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">Class</span>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="mt-1 flex h-9 min-w-[12rem] rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All classes</option>
              {initialClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" size="sm" onClick={applyFilters}>
            Apply
          </Button>
          {view === "detail" ? (
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={downloadExcel}>
              <Download className="size-4" />
              Excel
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending || !classId.trim()}
              onClick={downloadSummaryExcel}
              title={!classId.trim() ? "Select a class to export summary" : undefined}
            >
              <Download className="size-4" />
              Excel (summary)
            </Button>
          )}
        </CardContent>
      </Card>

      {message ? <p className="text-sm text-destructive">{message}</p> : null}

      {view === "detail" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rows ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Class</th>
                  <th className="py-2 pr-2">Student</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Marked at</th>
                  <th className="py-2 pr-2">Marked by</th>
                  <th className="py-2">Final</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/80">
                    <td className="py-2 pr-2">{r.sessionDate}</td>
                    <td className="py-2 pr-2">{r.className}</td>
                    <td className="py-2 pr-2">{r.studentName}</td>
                    <td className="py-2 pr-2">{r.status.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-2">{new Date(r.markedAt).toLocaleString()}</td>
                    <td className="py-2 pr-2">{r.markedByName ?? "—"}</td>
                    <td className="py-2">{r.finalized ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No attendance in this range yet.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : !classId.trim() ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Class summary</CardTitle>
            <CardDescription>Select a class above, then Apply, to see per-student counts.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Class summary needs one class (not &quot;All classes&quot;). Choose a class and click Apply.
            </p>
          </CardContent>
        </Card>
      ) : summary ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Class summary ({summary.rows.length} students)</CardTitle>
            <CardDescription>
              {summary.className} · {summary.sessionsInRange} session(s) with a date in {dateFrom}–{dateTo}. Counts are
              attendance marks in that range (draft and finalized).
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-2">Student</th>
                  <th className="py-2 pr-2">Present</th>
                  <th className="py-2 pr-2">Late</th>
                  <th className="py-2 pr-2">Absent (excused)</th>
                  <th className="py-2 pr-2">Absent (unexcused)</th>
                  <th className="py-2 pr-2">Total marks</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((r) => {
                  const total = r.present + r.late + r.absentExcused + r.absentUnexcused;
                  return (
                    <tr key={r.studentId} className="border-b border-border/80">
                      <td className="py-2 pr-2 font-medium">{r.studentName}</td>
                      <td className="py-2 pr-2 tabular-nums">{r.present}</td>
                      <td className="py-2 pr-2 tabular-nums">{r.late}</td>
                      <td className="py-2 pr-2 tabular-nums">{r.absentExcused}</td>
                      <td className="py-2 pr-2 tabular-nums">{r.absentUnexcused}</td>
                      <td className="py-2 pr-2 tabular-nums text-muted-foreground">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {summary.rows.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No students enrolled in this class.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Class summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Loading summary failed or data is empty. Try Apply again.</p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
