import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession, requireTeacherSession } from "@/lib/session";
import { buildAttendanceUrl } from "@/lib/attendance-utils";
import { fetchFinalizedSessionsMarkedByProfile } from "@/lib/tracker-queries";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function FinalizedByMePage() {
  const { user, appRole } = requireTeacherSession(await getSession());

  const orgCtx = await getOrganizationShellContext({ userId: user.id, appRole });
  const orgId = orgCtx.activeOrganizationId;
  if (!orgId) redirect("/onboarding");

  const rows = await fetchFinalizedSessionsMarkedByProfile(orgId, user.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finalized sessions you marked</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sessions you finalized, plus any finalized session where you last saved at least one roster row. Open one to
          move it back to draft, fix mistakes, save, and finalize again.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessions</CardTitle>
          <CardDescription>
            {rows.length === 0 ? "None found yet." : `${rows.length} session(s).`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Finalize attendance from the main Attendance screen to see rows here.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {rows.map((row) => (
                <li
                  key={row.sessionId}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{row.className}</p>
                    <p className="text-muted-foreground">
                      Session date {row.sessionDate}
                      {row.recordsMarked > 0
                        ? ` · ${row.recordsMarked} roster row${row.recordsMarked === 1 ? "" : "s"} you last saved`
                        : " · finalized by you (no roster rows attributed to your account)"}
                    </p>
                  </div>
                  <Link
                    href={buildAttendanceUrl({
                      classId: row.classId,
                      sessionId: row.sessionId,
                      reopen: true,
                      returnTo: "/attendance/finalized-by-me",
                    })}
                    className={cn(buttonVariants({ variant: "default", size: "sm" }), "inline-flex shrink-0")}
                  >
                    Open to edit
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
