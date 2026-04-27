import { redirect } from "next/navigation";
import { CreateOrganizationForm } from "@/components/create-organization-form";
import { ClassesClient } from "@/app/onboarding/classes-client";
import { MissedAttendanceBanner } from "@/components/missed-attendance-banner";
import { fetchClassesForOrg, fetchMissedAttendanceOccurrences, resolveTeacherClassAccess } from "@/lib/tracker-queries";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession } from "@/lib/session";

export default async function OnboardingClassesPage() {
  const { user, appRole } = await getSession();
  if (!user || appRole !== "teacher") {
    redirect("/login");
  }

  const orgCtx = await getOrganizationShellContext({ userId: user.id, appRole });
  if (orgCtx.organizations.length === 0) {
    return <CreateOrganizationForm />;
  }

  const activeId = orgCtx.activeOrganizationId;
  if (!activeId) {
    return <CreateOrganizationForm />;
  }

  const access = await resolveTeacherClassAccess(user.id, activeId);
  const classes = await fetchClassesForOrg(activeId, access);
  const missedAttendance = await fetchMissedAttendanceOccurrences(activeId, access);
  return (
    <>
      {missedAttendance.length > 0 ? <MissedAttendanceBanner items={missedAttendance} /> : null}
      <ClassesClient organizationId={activeId} initialClasses={classes} />
    </>
  );
}
