import { notFound, redirect } from "next/navigation";
import { ClassFeedClient } from "./class-feed-client";
import { fetchOrgMembershipRole, getOrganizationShellContext } from "@/lib/organization-server";
import { getSession } from "@/lib/session";
import {
  fetchAssignedClassIdsForTeacher,
  fetchClassById,
  fetchClassFeedPosts,
  fetchEnrollmentsForOrg,
  fetchStudentsForOrg,
  teacherHasAccessToClass,
} from "@/lib/tracker-queries";

export default async function ClassFeedPage({ params }: { params: Promise<{ classId: string }> }) {
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
  const enrollments = await fetchEnrollmentsForOrg(orgId, scopedClassIds);
  const classStudentIds = [...new Set(enrollments.filter((e) => e.classId === classId).map((e) => e.studentId))];
  const students = await fetchStudentsForOrg(orgId, classStudentIds);
  const { posts, error: feedError } = await fetchClassFeedPosts({
    organizationId: orgId,
    classId,
    includeDrafts: true,
  });

  return (
    <ClassFeedClient
      organizationId={orgId}
      classId={classId}
      className={classRoom.name}
      students={students}
      posts={posts}
      feedError={feedError}
    />
  );
}
