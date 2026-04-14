import { redirect } from "next/navigation";
import { StudentsClient } from "@/app/students/students-client";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession } from "@/lib/session";
import {
  fetchClassesForOrg,
  fetchEnrollmentsForOrg,
  fetchStudentsForOrg,
  resolveTeacherClassAccess,
} from "@/lib/tracker-queries";

export default async function StudentsManagementPage() {
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
  const [students, classes, enrollments] = await Promise.all([
    fetchStudentsForOrg(orgId),
    fetchClassesForOrg(orgId, access),
    fetchEnrollmentsForOrg(orgId),
  ]);

  return (
    <StudentsClient
      organizationId={orgId}
      initialStudents={students}
      initialClasses={classes}
      initialEnrollments={enrollments}
    />
  );
}
