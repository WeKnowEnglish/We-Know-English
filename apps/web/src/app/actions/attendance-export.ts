"use server";

import ExcelJS from "exceljs";
import {
  fetchAttendanceClassSummaryForOrg,
  fetchAttendanceReportForOrg,
  verifyOrgMembership,
} from "@/lib/tracker-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function exportAttendanceReportExcelAction(params: {
  organizationId: string;
  dateFrom: string;
  dateTo: string;
  classId?: string | null;
  /** Default `detail`: row-per-mark export. `summary` requires `classId` and exports per-student counts. */
  view?: "detail" | "summary";
}): Promise<{ ok: true; base64: string; filename: string } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Not configured" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const ok = await verifyOrgMembership(user.id, params.organizationId);
  if (!ok) return { ok: false, error: "Unauthorized" };

  const view = params.view ?? "detail";

  if (view === "summary") {
    const classId = params.classId?.trim();
    if (!classId) return { ok: false, error: "Class summary export requires a class" };

    const summary = await fetchAttendanceClassSummaryForOrg({
      organizationId: params.organizationId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      classId,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WKE Student Tracker";
    const sheet = workbook.addWorksheet("Class summary", {
      properties: { defaultColWidth: 18 },
    });
    sheet.addRow([`Class: ${summary.className} · Sessions in range: ${summary.sessionsInRange} · ${params.dateFrom} to ${params.dateTo}`]);
    const header = sheet.addRow([
      "Student",
      "Present",
      "Late",
      "Absent (excused)",
      "Absent (unexcused)",
      "Total marks",
    ]);
    header.font = { bold: true };
    for (const r of summary.rows) {
      const total = r.present + r.late + r.absentExcused + r.absentUnexcused;
      sheet.addRow([r.studentName, r.present, r.late, r.absentExcused, r.absentUnexcused, total]);
    }

    const buf = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const filename = `attendance-summary-${params.dateFrom}-to-${params.dateTo}.xlsx`;
    return { ok: true, base64, filename };
  }

  const rows = await fetchAttendanceReportForOrg({
    organizationId: params.organizationId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    classId: params.classId ?? null,
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WKE Student Tracker";
  const sheet = workbook.addWorksheet("Attendance", {
    properties: { defaultColWidth: 18 },
  });
  sheet.columns = [
    { header: "Session date", key: "sessionDate" },
    { header: "Class", key: "className" },
    { header: "Student", key: "studentName" },
    { header: "Status", key: "status" },
    { header: "Marked at (UTC)", key: "markedAt" },
    { header: "Marked by", key: "markedBy" },
    { header: "Finalized", key: "finalized" },
  ];
  for (const r of rows) {
    sheet.addRow({
      sessionDate: r.sessionDate,
      className: r.className,
      studentName: r.studentName,
      status: r.status,
      markedAt: r.markedAt,
      markedBy: r.markedByName ?? "",
      finalized: r.finalized ? "Yes" : "No",
    });
  }
  sheet.getRow(1).font = { bold: true };

  const buf = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buf).toString("base64");
  const filename = `attendance-${params.dateFrom}-to-${params.dateTo}.xlsx`;
  return { ok: true, base64, filename };
}
