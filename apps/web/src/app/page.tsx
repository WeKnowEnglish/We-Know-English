import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentJoinClassPanel } from "@/components/student-join-class-panel";
import { StudentMyClassesPanel } from "@/components/student-my-classes-panel";
import { TeacherHomePanel } from "@/components/teacher-home-panel";
import { getNavGroupsForRole } from "@/lib/nav";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession } from "@/lib/session";
import { fetchClassesForOrg, fetchStudentEnrollmentClasses, resolveTeacherClassAccess } from "@/lib/tracker-queries";

function toDisplayName(value: string) {
  return value
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getWelcomeName(email: string | null, metadataName: unknown) {
  if (typeof metadataName === "string" && metadataName.trim().length > 0) {
    return metadataName.trim();
  }
  if (!email) return "Teacher";
  const localPart = email.split("@")[0] ?? "";
  return toDisplayName(localPart) || "Teacher";
}

export default async function Home() {
  const { appRole, user } = await getSession();
  const groups = getNavGroupsForRole(appRole);
  const isTeacherView = appRole !== "student";
  const homeGroups = isTeacherView ? groups.filter((group) => group.title !== "Start") : groups;
  const now = new Date();
  const dateTimeLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  const welcomeName = getWelcomeName(user?.email ?? null, user?.user_metadata?.full_name ?? user?.user_metadata?.name);

  let recentClasses: Awaited<ReturnType<typeof fetchClassesForOrg>> = [];
  let studentEnrollments: Awaited<ReturnType<typeof fetchStudentEnrollmentClasses>> = [];
  if (isTeacherView && user?.id) {
    const orgCtx = await getOrganizationShellContext({ userId: user.id, appRole: "teacher" });
    if (orgCtx.activeOrganizationId) {
      const access = await resolveTeacherClassAccess(user.id, orgCtx.activeOrganizationId);
      const all = await fetchClassesForOrg(orgCtx.activeOrganizationId, access);
      recentClasses = [...all]
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
        .slice(0, 3);
    }
  } else if (!isTeacherView && user?.id) {
    studentEnrollments = await fetchStudentEnrollmentClasses();
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10">
      {isTeacherView ? (
        <TeacherHomePanel welcomeName={welcomeName} dateTimeLabel={dateTimeLabel} recentClasses={recentClasses} />
      ) : (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">WKE Student Tracker & Parent Portal</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Signed in as a <strong className="capitalize text-foreground">{appRole ?? "member"}</strong>. Students see Home
              and parent tools; teachers get the full tutor and billing areas. Use the left menu or pick a card below.
            </p>
          </div>
          {user?.id ? (
            <div className="space-y-6">
              <StudentJoinClassPanel
                authUserId={user.id}
                userEmail={user.email ?? null}
                displayName={
                  typeof user.user_metadata?.full_name === "string"
                    ? user.user_metadata.full_name
                    : typeof user.user_metadata?.name === "string"
                      ? user.user_metadata.name
                      : null
                }
              />
              <StudentMyClassesPanel enrollments={studentEnrollments} />
            </div>
          ) : null}
        </div>
      )}

      {homeGroups.map((group) => (
        <section key={group.title}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.links.map((item) => (
              <Link key={item.href} href={item.href}>
                <Card className="h-full transition-colors hover:bg-accent/40">
                  <CardHeader>
                    <CardTitle className="text-lg">{item.label}</CardTitle>
                    {item.description ? <CardDescription>{item.description}</CardDescription> : null}
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
