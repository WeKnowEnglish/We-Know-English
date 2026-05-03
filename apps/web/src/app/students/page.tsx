import { redirect } from "next/navigation";
import { StudentsClient } from "@/app/students/students-client";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession, requireTeacherSession } from "@/lib/session";
import {
  fetchAssignedClassIdsForTeacher,
  fetchClassesForOrg,
  fetchEnrollmentsForOrg,
  fetchStudentsForOrg,
  resolveTeacherClassAccess,
} from "@/lib/tracker-queries";

export default async function StudentsManagementPage() {
  const { user, appRole } = requireTeacherSession(await getSession());

  const orgCtx = await getOrganizationShellContext({ userId: user.id, appRole });
  const orgId = orgCtx.activeOrganizationId;
  if (!orgId) {
    redirect("/onboarding");
  }

  const access = await resolveTeacherClassAccess(user.id, orgId);
  const scopedClassIds =
    access && (access.orgRole === "staff" || access.orgRole === "client")
      ? await fetchAssignedClassIdsForTeacher(orgId, user.id)
      : null;
  const [classes, enrollments] = await Promise.all([
    fetchClassesForOrg(orgId, access),
    fetchEnrollmentsForOrg(orgId, scopedClassIds),
  ]);
  const scopedStudentIds = [...new Set(enrollments.map((row) => row.studentId))];
  const students = await fetchStudentsForOrg(orgId, scopedClassIds ? scopedStudentIds : null);

  return (
    <StudentsClient
      organizationId={orgId}
      initialStudents={students}
      initialClasses={classes}
      initialEnrollments={enrollments}
    />
  );
}
