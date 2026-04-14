import { redirect } from "next/navigation";
import { ScheduleClient } from "@/app/schedule/schedule-client";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession } from "@/lib/session";
import { getScheduleTimezoneForOrganization } from "@/lib/organization-schedule-timezone";
import { fetchClassesForOrg, resolveTeacherClassAccess } from "@/lib/tracker-queries";

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
  const [classes, scheduleTimeZone] = await Promise.all([
    fetchClassesForOrg(orgId, access),
    getScheduleTimezoneForOrganization(orgId),
  ]);
  return <ScheduleClient organizationId={orgId} scheduleTimeZone={scheduleTimeZone} initialClasses={classes} />;
}
