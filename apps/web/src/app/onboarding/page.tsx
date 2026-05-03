import { CreateOrganizationForm } from "@/components/create-organization-form";
import { ClassesClient } from "@/app/onboarding/classes-client";
import { MissedAttendanceBanner } from "@/components/missed-attendance-banner";
import {
  fetchClassesForOrg,
  fetchEnrollmentsForOrg,
  fetchMissedAttendanceOccurrences,
  resolveTeacherClassAccess,
} from "@/lib/tracker-queries";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession, requireTeacherSession } from "@/lib/session";

export default async function OnboardingClassesPage() {
  const { user, appRole } = requireTeacherSession(await getSession());

  const orgCtx = await getOrganizationShellContext({ userId: user.id, appRole });
  if (orgCtx.organizations.length === 0) {
    return <CreateOrganizationForm />;
  }

  const activeId = orgCtx.activeOrganizationId;
  if (!activeId) {
    return <CreateOrganizationForm />;
  }

  const access = await resolveTeacherClassAccess(user.id, activeId);
  const [classes, enrollments] = await Promise.all([
    fetchClassesForOrg(activeId, access),
    fetchEnrollmentsForOrg(activeId),
  ]);
  const missedAttendance = await fetchMissedAttendanceOccurrences(activeId, access, {
    classes,
    enrollments,
  });
  return (
    <>
      {missedAttendance.length > 0 ? <MissedAttendanceBanner items={missedAttendance} /> : null}
      <ClassesClient organizationId={activeId} initialClasses={classes} />
    </>
  );
}
