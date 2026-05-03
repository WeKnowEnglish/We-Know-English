import { redirect } from "next/navigation";
import { subDays } from "date-fns";
import { AttendanceReportClient } from "@/app/attendance/report/attendance-report-client";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession, requireTeacherSession } from "@/lib/session";
import {
  fetchAttendanceClassSummaryForOrg,
  fetchAttendanceReportForOrg,
  fetchClassesForOrg,
  resolveTeacherClassAccess,
} from "@/lib/tracker-queries";

export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { user, appRole } = requireTeacherSession(await getSession());

  const orgCtx = await getOrganizationShellContext({ userId: user.id, appRole });
  const orgId = orgCtx.activeOrganizationId;
  if (!orgId) redirect("/onboarding");

  const dateTo =
    typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)
      ? sp.to
      : new Date().toISOString().slice(0, 10);
  /** Default one year back so older catch-up months stay visible; PostgREST also caps each query at ~1000 rows. */
  const dateFrom =
    typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)
      ? sp.from
      : subDays(new Date(`${dateTo}T12:00:00`), 365).toISOString().slice(0, 10);
  const classId = typeof sp.classId === "string" && sp.classId.length > 0 ? sp.classId : null;
  const viewRaw = typeof sp.view === "string" ? sp.view.toLowerCase() : "";
  const view = viewRaw === "summary" ? "summary" : "detail";

  const access = await resolveTeacherClassAccess(user.id, orgId);
  const classes = await fetchClassesForOrg(orgId, access);
  const allowedClassIds = access?.orgRole === "staff" ? classes.map((c) => c.id) : undefined;

  const [rows, summaryResult] = await Promise.all([
    fetchAttendanceReportForOrg({
      organizationId: orgId,
      dateFrom,
      dateTo,
      classId,
      allowedClassIds,
    }),
    view === "summary" && classId
      ? fetchAttendanceClassSummaryForOrg({
          organizationId: orgId,
          dateFrom,
          dateTo,
          classId,
        })
      : Promise.resolve(null),
  ]);

  return (
    <AttendanceReportClient
      organizationId={orgId}
      initialClasses={classes}
      initialRows={rows}
      initialDateFrom={dateFrom}
      initialDateTo={dateTo}
      initialClassId={classId}
      initialView={view}
      initialSummaryResult={summaryResult}
    />
  );
}
