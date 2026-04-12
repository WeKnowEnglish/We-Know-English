import { notFound, redirect } from "next/navigation";
import { StudentDetailClient } from "./student-detail-client";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession } from "@/lib/session";
import {
  fetchAttendanceHistoryForStudent,
  fetchClassesForOrg,
  fetchEnrollmentsForOrg,
  fetchStudentById,
} from "@/lib/tracker-queries";

export default async function StudentTeacherViewPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const { user, appRole } = await getSession();
  if (!user || appRole !== "teacher") {
    redirect("/login");
  }

  const orgCtx = await getOrganizationShellContext({ userId: user.id, appRole });
  const orgId = orgCtx.activeOrganizationId;
  if (!orgId) {
    redirect("/onboarding");
  }

  const [student, classes, enrollments, attendanceHistory] = await Promise.all([
    fetchStudentById(orgId, studentId),
    fetchClassesForOrg(orgId),
    fetchEnrollmentsForOrg(orgId),
    fetchAttendanceHistoryForStudent(orgId, studentId),
  ]);

  if (!student) {
    notFound();
  }

  const enrolledClasses = enrollments
    .filter((row) => row.studentId === student.id)
    .map((row) => classes.find((classRoom) => classRoom.id === row.classId))
    .filter((classRoom): classRoom is NonNullable<typeof classRoom> => Boolean(classRoom));

  return (
    <StudentDetailClient student={student} enrolledClasses={enrolledClasses} recentUpdates={[]} attendanceHistory={attendanceHistory} />
  );
}
