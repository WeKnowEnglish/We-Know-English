import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AttendanceClient } from "@/app/attendance/attendance-client";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession } from "@/lib/session";
import { isSessionUuid } from "@/lib/attendance-utils";
import {
  fetchAttendancePriorityClasses,
  fetchAttendanceSessionBundle,
  fetchClassesForOrg,
  fetchEnrollmentsForOrg,
  fetchStudentsForOrg,
  resolveTeacherClassAccess,
} from "@/lib/tracker-queries";

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

  const { user, appRole } = await getSession();
  if (!user || appRole !== "teacher") {
    redirect("/login");
  }

  const orgCtx = await getOrganizationShellContext({ userId: user.id, appRole });
  const orgId = orgCtx.activeOrganizationId;
  if (!orgId) {
    redirect("/onboarding");
  }

  const access = await resolveTeacherClassAccess(user.id, orgId);
  const [classes, students, enrollments, initialSessionBundle, priorityClasses] = await Promise.all([
    fetchClassesForOrg(orgId, access),
    fetchStudentsForOrg(orgId),
    fetchEnrollmentsForOrg(orgId),
    sessionIdFromQuery && isSessionUuid(sessionIdFromQuery)
      ? fetchAttendanceSessionBundle(orgId, sessionIdFromQuery)
      : Promise.resolve(null),
    fetchAttendancePriorityClasses(orgId, access),
  ]);

  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-16">
          <p className="text-sm text-muted-foreground">Loading attendance…</p>
        </main>
      }
    >
      <AttendanceClient
        organizationId={orgId}
        initialClasses={classes}
        initialStudents={students}
        initialEnrollments={enrollments}
        priorityClasses={priorityClasses}
        initialSessionBundle={initialSessionBundle}
        classIdFromQuery={classIdFromQuery}
        sessionIdFromQuery={sessionIdFromQuery}
        occurrenceKeyFromQuery={occurrenceKeyFromQuery}
        sessionDateFromQuery={sessionDateFromQuery}
        reopenFromQuery={reopenFromQuery}
      />
    </Suspense>
  );
}
