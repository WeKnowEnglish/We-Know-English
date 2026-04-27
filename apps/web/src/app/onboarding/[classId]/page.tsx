import { notFound, redirect } from "next/navigation";
import { ClassDetailClient } from "./class-detail-client";
import { fetchOrgMembershipRole, getOrganizationShellContext } from "@/lib/organization-server";
import { getSession } from "@/lib/session";
import { getScheduleTimezoneForOrganization } from "@/lib/organization-schedule-timezone";
import {
  fetchAssignedClassIdsForTeacher,
  fetchAttendanceSlotsForClass,
  fetchClassById,
  fetchClassTeacherPanelData,
  fetchEnrollmentsForOrg,
  fetchStudentsForOrg,
  teacherHasAccessToClass,
} from "@/lib/tracker-queries";

export default async function ClassDetailPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const { user, appRole } = await getSession();
  if (!user || appRole !== "teacher") {
    redirect("/login");
  }

  const orgCtx = await getOrganizationShellContext({ userId: user.id, appRole });
  const orgId = orgCtx.activeOrganizationId;
  if (!orgId) {
    redirect("/onboarding");
  }

  const orgRole = await fetchOrgMembershipRole(user.id, orgId);
  if (!orgRole) {
    redirect("/onboarding");
  }

  const allowed = await teacherHasAccessToClass(orgId, user.id, orgRole, classId);
  if (!allowed) {
    notFound();
  }

  const classRoom = await fetchClassById(orgId, classId);
  if (!classRoom) {
    notFound();
  }

  const scopedClassIds =
    orgRole === "owner" ? null : await fetchAssignedClassIdsForTeacher(orgId, user.id);

  const [enrollments, attendanceSlots, teacherPanel, scheduleTimeZone] = await Promise.all([
    fetchEnrollmentsForOrg(orgId, scopedClassIds),
    fetchAttendanceSlotsForClass(orgId, classRoom),
    fetchClassTeacherPanelData(orgId, classId, { userId: user.id, orgRole }),
    getScheduleTimezoneForOrganization(orgId),
  ]);
  const visibleStudentIds = [...new Set(enrollments.map((row) => row.studentId))];
  const students = await fetchStudentsForOrg(orgId, scopedClassIds ? visibleStudentIds : null);

  return (
    <ClassDetailClient
      organizationId={orgId}
      scheduleTimeZone={scheduleTimeZone}
      classId={classId}
      initialClassRoom={classRoom}
      initialStudents={students}
      initialEnrollments={enrollments}
      initialAttendanceSlots={attendanceSlots}
      initialTeacherPanel={teacherPanel}
    />
  );
}
