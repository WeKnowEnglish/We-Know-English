import { redirect } from "next/navigation";
import { ScheduleClient } from "@/app/schedule/schedule-client";
import { fetchOrgMembershipRole } from "@/lib/organization-server";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession } from "@/lib/session";
import { getScheduleTimezoneForOrganization } from "@/lib/organization-schedule-timezone";
import { fetchAssignedClassIdsForTeacher, fetchClassesForOrg, resolveTeacherClassAccess } from "@/lib/tracker-queries";

export default async function SchedulePage() {
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
  const [orgRole, myClassIds, allClasses, myClasses, scheduleTimeZone] = await Promise.all([
    fetchOrgMembershipRole(user.id, orgId),
    fetchAssignedClassIdsForTeacher(orgId, user.id),
    fetchClassesForOrg(orgId, null),
    fetchClassesForOrg(orgId, access),
    getScheduleTimezoneForOrganization(orgId),
  ]);
  return (
    <ScheduleClient
      organizationId={orgId}
      scheduleTimeZone={scheduleTimeZone}
      orgRole={orgRole ?? "staff"}
      initialMyClassIds={myClassIds}
      initialAllClasses={allClasses}
      initialMyClasses={myClasses}
    />
  );
}
