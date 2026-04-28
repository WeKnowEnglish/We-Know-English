"use client";

import { useEffect, useState, useTransition } from "react";
import { approveJoinRequestAction, rejectJoinRequestAction } from "@/app/actions/organization";
import type { PendingJoinRequestRow } from "@/lib/organization-server";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";

type OrgDetailClientProps = {
  initialPending: PendingJoinRequestRow[];
};

export function OrgDetailPendingClient({ initialPending }: OrgDetailClientProps) {
  const [rows, setRows] = useState(initialPending);
  useEffect(() => {
    setRows(initialPending);
  }, [initialPending]);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [actingId, setActingId] = useState<string | null>(null);

  function afterSuccess() {
    setMessage(null);
    setIsError(false);
  }

  function onApprove(requestId: string) {
    setMessage(null);
    setActingId(requestId);
    startTransition(async () => {
      if (!isSupabaseConfigured()) {
        setMessage("Supabase is not configured.");
        setIsError(true);
        setActingId(null);
        return;
      }
      const result = await approveJoinRequestAction(requestId);
      setActingId(null);
      if (!result.ok) {
        setMessage(result.error);
        setIsError(true);
        return;
      }
      setRows((r) => r.filter((row) => row.request_id !== requestId));
      afterSuccess();
    });
  }

  function onReject(requestId: string) {
    if (!window.confirm("Reject this join request? The teacher can send a new request later.")) return;
    setMessage(null);
    setActingId(requestId);
    startTransition(async () => {
      if (!isSupabaseConfigured()) {
        setMessage("Supabase is not configured.");
        setIsError(true);
        setActingId(null);
        return;
      }
      const result = await rejectJoinRequestAction(requestId);
      setActingId(null);
      if (!result.ok) {
        setMessage(result.error);
        setIsError(true);
        return;
      }
      setRows((r) => r.filter((row) => row.request_id !== requestId));
      afterSuccess();
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending join requests.</p>;
  }

  return (
    <div className="space-y-3">
      {message ? (
        <p className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`} role={isError ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
      <ul className="divide-y divide-border rounded-xl border border-border">
        {rows.map((row) => (
          <li key={row.request_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-foreground">{row.requester_full_name || "Teacher"}</p>
              <p className="text-xs text-muted-foreground">{row.requester_email || row.profile_id}</p>
              <p className="text-xs text-muted-foreground">
                Requested{" "}
                {row.created_at
                  ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at))
                  : "—"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending && actingId === row.request_id}
                onClick={() => onReject(row.request_id)}
              >
                Reject
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending && actingId === row.request_id}
                onClick={() => onApprove(row.request_id)}
              >
                {isPending && actingId === row.request_id ? "…" : "Approve as staff"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
