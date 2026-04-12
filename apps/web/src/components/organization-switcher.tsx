"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setActiveOrganization } from "@/app/actions/organization";
import type { OrgSummary } from "@/lib/organization-server";
type OrganizationSwitcherProps = {
  organizations: OrgSummary[];
  activeOrganizationId: string | null;
};

export function OrganizationSwitcher({ organizations, activeOrganizationId }: OrganizationSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (organizations.length < 2) return null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor="org-switcher" className="sr-only">
        Organization
      </label>
      <select
        id="org-switcher"
        disabled={pending}
        value={activeOrganizationId ?? ""}
        onChange={(event) => {
          const next = event.target.value;
          if (!next) return;
          setError(null);
          startTransition(async () => {
            const result = await setActiveOrganization(next);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
        className="h-8 max-w-[10rem] truncate rounded-md border border-input bg-background px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:max-w-[14rem]"
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
