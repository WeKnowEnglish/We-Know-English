"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteOrganizationAction } from "@/app/actions/organization";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";

type OrgDeleteClientProps = {
  organizationId: string;
  organizationName: string;
};

export function OrgDeleteClient({ organizationId, organizationName }: OrgDeleteClientProps) {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canDelete = useMemo(
    () => confirmName.trim().toLowerCase() === organizationName.trim().toLowerCase(),
    [confirmName, organizationName],
  );

  function onDelete() {
    if (!canDelete) return;
    if (!window.confirm(`Delete "${organizationName}" permanently? This cannot be undone.`)) return;
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      if (!isSupabaseConfigured()) {
        setMessage("Supabase is not configured.");
        setIsError(true);
        return;
      }
      const res = await deleteOrganizationAction(organizationId);
      if (!res.ok) {
        setMessage(res.error);
        setIsError(true);
        return;
      }
      router.push("/organizations");
    });
  }

  return (
    <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-destructive">Danger zone</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Deleting this organization permanently removes classes, students, attendance, billing, and member data.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        To confirm, type <strong>{organizationName}</strong> below.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          placeholder="Type organization name to confirm"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:max-w-sm"
        />
        <Button type="button" variant="destructive" disabled={!canDelete || isPending} onClick={onDelete}>
          {isPending ? "Deleting..." : "Delete organization"}
        </Button>
      </div>
      {message ? (
        <p className={`mt-2 text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`} role={isError ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
    </section>
  );
}
