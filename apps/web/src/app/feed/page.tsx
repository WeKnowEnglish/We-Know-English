import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrganizationShellContext } from "@/lib/organization-server";
import { getSession } from "@/lib/session";
import { fetchClassesForOrg, resolveTeacherClassAccess } from "@/lib/tracker-queries";

export default async function FeedPage() {
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
  const classes = await fetchClassesForOrg(orgId, access);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-6 py-8">
      <h1 className="text-2xl font-semibold">Class Feed</h1>
      <p className="text-sm text-muted-foreground">Choose a class to open its source feed and post updates.</p>
      <section className="rounded-xl border border-border bg-card p-4">
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No classes available yet. Create a class first.</p>
        ) : (
          <ul className="space-y-2">
            {classes.map((classRoom) => (
              <li key={classRoom.id}>
                <Link
                  href={`/classes/${classRoom.id}/feed`}
                  className="block rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  {classRoom.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
