import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession, requireTeacherSession } from "@/lib/session";
import { buildAttendanceUrl } from "@/lib/attendance-utils";
import {
  fetchClassesForOrg,
  fetchEnrollmentsForOrg,
  fetchMissedAttendanceOccurrences,
  resolveTeacherClassAccess,
} from "@/lib/tracker-queries";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function MissedAttendancePage() {
  const { user, appRole } = requireTeacherSession(await getSession());

  const orgCtx = await getOrganizationShellContext({ userId: user.id, appRole });
  const orgId = orgCtx.activeOrganizationId;
  if (!orgId) redirect("/onboarding");

  const access = await resolveTeacherClassAccess(user.id, orgId);
  const [classes, enrollments] = await Promise.all([
    fetchClassesForOrg(orgId, access),
    fetchEnrollmentsForOrg(orgId),
  ]);
  const items = await fetchMissedAttendanceOccurrences(orgId, access, { classes, enrollments });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Missed attendance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Past class meetings from your schedule that are not finalized yet. Open any row to catch up; this list stays
          here after you dismiss the home popup.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessions needing attention</CardTitle>
          <CardDescription>{items.length === 0 ? "You are all caught up." : `${items.length} open.`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to show right now.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it.occurrenceKey} className="rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm">
                  <p className="font-medium">{it.className}</p>
                  <p className="text-muted-foreground">
                    {new Date(it.startsAt).toLocaleString()} · session date {it.sessionDate}
                  </p>
                  <Link
                    href={buildAttendanceUrl({
                      classId: it.classId,
                      occurrenceKey: it.occurrenceKey,
                      sessionDate: it.sessionDate,
                      returnTo: "/attendance/missed",
                    })}
                    className={cn(buttonVariants({ variant: "default", size: "sm" }), "mt-2 inline-flex")}
                  >
                    Take or finish attendance
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Link href="/attendance" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to attendance
      </Link>
    </main>
  );
}
