"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  requestJoinOrganizationAction,
  searchOrganizationsForTeachersAction,
  type OrganizationDirectoryRow,
} from "@/app/actions/organization";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";

type OrganizationsClientProps = {
  memberOrgIds: string[];
  pendingOrgIds: string[];
};

export function OrganizationsClient({ memberOrgIds, pendingOrgIds }: OrganizationsClientProps) {
  const router = useRouter();
  const memberSet = new Set(memberOrgIds);
  const pendingSet = new Set(pendingOrgIds);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<OrganizationDirectoryRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [searchPending, startSearch] = useTransition();
  const [requestPending, startRequest] = useTransition();
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const runSearch = useCallback((q: string) => {
    setMessage(null);
    setIsError(false);
    startSearch(async () => {
      if (!isSupabaseConfigured()) {
        setMessage("Supabase is not configured.");
        setIsError(true);
        setRows([]);
        return;
      }
      const result = await searchOrganizationsForTeachersAction(q);
      if (!result.ok) {
        setMessage(result.error);
        setIsError(true);
        setRows([]);
        return;
      }
      setRows(result.rows);
    });
  }, []);

  useEffect(() => {
    runSearch("");
  }, [runSearch]);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(query);
  }

  function onRequestJoin(organizationId: string) {
    setMessage(null);
    setIsError(false);
    setRequestingId(organizationId);
    startRequest(async () => {
      if (!isSupabaseConfigured()) {
        setMessage("Supabase is not configured.");
        setIsError(true);
        setRequestingId(null);
        return;
      }
      const result = await requestJoinOrganizationAction(organizationId);
      setRequestingId(null);
      if (!result.ok) {
        setMessage(result.error);
        setIsError(true);
        return;
      }
      if (result.kind === "already_member") {
        setMessage("You are already a member of this organization.");
      } else if (result.kind === "already_pending") {
        setMessage("You already have a pending request. The owner can approve it from the organization page.");
      } else {
        setMessage(
          "Request sent. The organization owner will review it on their org page. You are not added until they approve.",
        );
      }
      setIsError(false);
      router.refresh();
      runSearch(query);
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1 text-sm font-medium">
          Search by name
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type part of the organization name…"
            autoComplete="off"
            className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
        <Button type="submit" disabled={searchPending}>
          {searchPending ? "Searching…" : "Search"}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        Results list every organization in this project. Use <strong>Request to join</strong> to ask the owner; you
        become <strong>staff</strong> only after they approve on the org&apos;s detail page.
      </p>

      {message ? (
        <p className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`} role={isError ? "alert" : "status"}>
          {message}
        </p>
      ) : null}

      <div className="rounded-xl border border-border">
        {rows.length === 0 && !searchPending ? (
          <p className="p-4 text-sm text-muted-foreground">No organizations match. Try a shorter search or leave the box empty to see the most recent.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const isMember = memberSet.has(row.id);
              const hasPendingRequest = pendingSet.has(row.id);
              return (
                <li key={row.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-foreground">{row.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{row.id}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isMember ? (
                      <span className="text-xs font-medium text-muted-foreground">Member</span>
                    ) : hasPendingRequest ? (
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-500">Request pending</span>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      disabled={isMember || hasPendingRequest || (requestPending && requestingId === row.id)}
                      onClick={() => onRequestJoin(row.id)}
                    >
                      {requestingId === row.id && requestPending
                        ? "Sending…"
                        : isMember
                          ? "Joined"
                          : hasPendingRequest
                            ? "Awaiting approval"
                            : "Request to join"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
