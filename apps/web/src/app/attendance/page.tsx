import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getScheduleTimezoneForOrganization } from "@/lib/organization-schedule-timezone";
import { getSession, requireTeacherSession } from "@/lib/session";
import { isSessionUuid } from "@/lib/attendance-utils";
import {
  fetchAttendancePriorityClasses,
  fetchAttendanceSessionBundle,
  fetchAttendanceSessionRosterStudents,
  fetchClassesForOrg,
  fetchEnrollmentsForOrg,
  resolveTeacherClassAccess,
} from "@/lib/tracker-queries";

const AttendanceClient = dynamic(() => import("./attendance-client").then((m) => m.AttendanceClient), {
  loading: () => (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-16">
      <p className="text-sm text-muted-foreground">Loading attendance…</p>
    </main>
  ),
});

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const classIdFromQuery = typeof sp.classId === "string" ? sp.classId : null;
  const sessionIdFromQuery = typeof sp.sessionId === "string" ? sp.sessionId : null;
  const occurrenceKeyFromQuery = typeof sp.occurrenceKey === "string" ? sp.occurrenceKey : null;
  const sessionDateFromQuery = typeof sp.sessionDate === "string" ? sp.sessionDate : null;
  const reopenFromQuery =
    typeof sp.reopen === "string" && (sp.reopen === "1" || sp.reopen.toLowerCase() === "true");

  const { user, appRole } = requireTeacherSession(await getSession());

  const orgCtx = await getOrganizationShellContext({ userId: user.id, appRole });
  const orgId = orgCtx.activeOrganizationId;
  if (!orgId) {
    redirect("/onboarding");
  }

  const access = await resolveTeacherClassAccess(user.id, orgId);
  const hasSessionUuid = Boolean(sessionIdFromQuery && isSessionUuid(sessionIdFromQuery));

  const classes = await fetchClassesForOrg(orgId, access);
  const classIds = classes.map((c) => c.id);
  const enrollments =
    classIds.length === 0 ? [] : await fetchEnrollmentsForOrg(orgId, classIds);

  const initialSessionBundle =
    hasSessionUuid && sessionIdFromQuery
      ? await fetchAttendanceSessionBundle(orgId, sessionIdFromQuery)
      : null;

  const rosterStudentsPromise = initialSessionBundle
    ? fetchAttendanceSessionRosterStudents(orgId, initialSessionBundle, enrollments)
    : Promise.resolve([]);

  const [scheduleTimeZone, priorityClasses, initialStudents] = await Promise.all([
    getScheduleTimezoneForOrganization(orgId),
    fetchAttendancePriorityClasses(orgId, access, { classes, enrollments }),
    rosterStudentsPromise,
  ]);

  return (
    <AttendanceClient
      organizationId={orgId}
      scheduleTimeZone={scheduleTimeZone}
      initialClasses={classes}
      initialStudents={initialStudents}
      initialEnrollments={enrollments}
      priorityClasses={priorityClasses}
      initialSessionBundle={initialSessionBundle}
      classIdFromQuery={classIdFromQuery}
      sessionIdFromQuery={sessionIdFromQuery}
      occurrenceKeyFromQuery={occurrenceKeyFromQuery}
      sessionDateFromQuery={sessionDateFromQuery}
      reopenFromQuery={reopenFromQuery}
    />
  );
}
