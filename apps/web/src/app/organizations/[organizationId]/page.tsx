import Link from "next/link";
import { redirect } from "next/navigation";
import { OrgDetailPendingClient } from "@/app/organizations/[organizationId]/org-detail-client";
import { OrgScheduleTimezoneForm } from "@/app/organizations/[organizationId]/org-schedule-timezone-form";
import {
  fetchOrgMembershipRole,
  fetchOrganizationByIdForMember,
  getPendingJoinRequestsForOrg,
} from "@/lib/organization-server";
import { getSession } from "@/lib/session";

type PageProps = { params: Promise<{ organizationId: string }> };

export default async function OrganizationDetailPage({ params }: PageProps) {
  const { organizationId } = await params;
  const { appRole, user } = await getSession();
  if (!user || appRole === "student") {
    redirect("/");
  }

  const org = await fetchOrganizationByIdForMember(organizationId, user.id);
  if (!org) {
    redirect("/organizations");
  }

  const role = await fetchOrgMembershipRole(user.id, organizationId);
  if (!role) {
    redirect("/organizations");
  }

  const pending = role === "owner" ? await getPendingJoinRequestsForOrg(organizationId) : [];

  const createdLabel = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(org.created_at));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10">
      <div>
        <Link href="/organizations" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Organizations
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{org.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Organization ID: <span className="font-mono text-xs">{org.id}</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Created {createdLabel}</p>
        <p className="mt-2 text-sm">
          Your role: <strong className="capitalize text-foreground">{role}</strong>
        </p>
      </div>

      {(role === "owner" || role === "staff") && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Schedule timezone</h2>
          <OrgScheduleTimezoneForm organizationId={organizationId} initialTimezone={org.scheduleTimezone} />
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Teacher join requests</h2>
        {role === "owner" ? (
          <div className="mt-3">
            <p className="mb-3 text-sm text-muted-foreground">
              Approve teachers who requested access. They become <strong>staff</strong> and can work with classes and
              students in this organization.
            </p>
            <OrgDetailPendingClient initialPending={pending} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Only the organization <strong>owner</strong> can approve or reject join requests. Contact an owner if you need
            someone added.
          </p>
        )}
      </section>
    </main>
  );
}
