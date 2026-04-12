import { notFound, redirect } from "next/navigation";
import { ClassDetailClient } from "./class-detail-client";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession } from "@/lib/session";
import {
  fetchAttendanceSlotsForClass,
  fetchClassById,
  fetchEnrollmentsForOrg,
  fetchStudentsForOrg,
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

  const classRoom = await fetchClassById(orgId, classId);
  if (!classRoom) {
    notFound();
  }

  const [students, enrollments, attendanceSlots] = await Promise.all([
    fetchStudentsForOrg(orgId),
    fetchEnrollmentsForOrg(orgId),
    fetchAttendanceSlotsForClass(orgId, classRoom),
  ]);

  return (
    <ClassDetailClient
      organizationId={orgId}
      classId={classId}
      initialClassRoom={classRoom}
      initialStudents={students}
      initialEnrollments={enrollments}
      initialAttendanceSlots={attendanceSlots}
    />
  );
}
