import Link from "next/link";
import { redirect } from "next/navigation";
import { OrganizationsClient } from "@/app/organizations/organizations-client";
import { CreateOrganizationForm } from "@/components/create-organization-form";
import {
  fetchPendingJoinRequestOrgIds,
  fetchTeacherOrganizationsWithRoles,
  getOrganizationShellContext,
} from "@/lib/organization-server";
import { getSession } from "@/lib/session";

export default async function OrganizationsPage() {
  const { appRole, user } = await getSession();
  if (!user || appRole === "student") {
    redirect("/");
  }

  const ctx = await getOrganizationShellContext({ userId: user.id, appRole: "teacher" });
  const myOrgsWithRoles = await fetchTeacherOrganizationsWithRoles(user.id);
  const pendingOrgIds = await fetchPendingJoinRequestOrgIds(user.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a new center when you need a separate space, or search and <strong>request to join</strong> an existing one.
          An <strong>owner</strong> must approve before you become staff. Manage requests on each org&apos;s page.
        </p>
      </div>
      <CreateOrganizationForm variant="card" />

      {myOrgsWithRoles.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your organizations</h2>
          <ul className="mt-3 space-y-2">
            {myOrgsWithRoles.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/organizations/${encodeURIComponent(o.id)}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-transparent px-2 py-2 text-sm transition-colors hover:border-border hover:bg-muted/50"
                >
                  <span className="font-medium text-foreground">{o.name}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                    {o.role}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <OrganizationsClient
        memberOrgIds={ctx.organizations.map((o) => o.id)}
        pendingOrgIds={pendingOrgIds}
      />
    </main>
  );
}
