"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { updateOrganizationMemberRoleAction } from "@/app/actions/organization";
import type { OrganizationMemberDirectoryRow } from "@/lib/organization-server";
import { isSupabaseConfigured } from "@/lib/env";

type OrgMembersClientProps = {
  organizationId: string;
  viewerRole: "owner" | "staff" | "client";
  viewerProfileId: string;
  initialMembers: OrganizationMemberDirectoryRow[];
};

const roleLabel: Record<"owner" | "staff" | "client", string> = {
  owner: "Admin",
  staff: "Teacher",
  client: "Assistant",
};

const options: Array<{ value: "owner" | "staff" | "client"; label: string }> = [
  { value: "owner", label: "Admin" },
  { value: "staff", label: "Teacher" },
  { value: "client", label: "Assistant" },
];

export function OrgMembersClient({
  organizationId,
  viewerRole,
  viewerProfileId,
  initialMembers,
}: OrgMembersClientProps) {
  const [members, setMembers] = useState(initialMembers);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  const canEdit = viewerRole === "owner";
  const ownerCount = useMemo(() => members.filter((m) => m.orgRole === "owner").length, [members]);
  const joinedLabel = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }), []);

  function onChangeRole(profileId: string, nextRole: "owner" | "staff" | "client") {
    const current = members.find((m) => m.profileId === profileId);
    if (!current || current.orgRole === nextRole) return;
    if (profileId === viewerProfileId && current.orgRole === "owner" && nextRole !== "owner" && ownerCount <= 1) {
      setMessage("You cannot demote the last admin.");
      setIsError(true);
      return;
    }

    setMessage(null);
    setIsError(false);
    setPendingProfileId(profileId);
    startTransition(async () => {
      if (!isSupabaseConfigured()) {
        setMessage("Supabase is not configured.");
        setIsError(true);
        setPendingProfileId(null);
        return;
      }
      const res = await updateOrganizationMemberRoleAction({
        organizationId,
        profileId,
        role: nextRole,
      });
      setPendingProfileId(null);
      if (!res.ok) {
        setMessage(res.error);
        setIsError(true);
        return;
      }
      setMembers((prev) =>
        prev
          .map((m) => (m.profileId === profileId ? { ...m, orgRole: nextRole } : m))
          .sort((a, b) => {
            const order = { owner: 0, staff: 1, client: 2 } as const;
            const roleDiff = order[a.orgRole] - order[b.orgRole];
            if (roleDiff !== 0) return roleDiff;
            return a.fullName.localeCompare(b.fullName);
          }),
      );
    });
  }

  if (members.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">No members found for this organization.</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      {message ? (
        <p className={`text-sm ${isError ? "text-destructive" : "text-muted-foreground"}`} role={isError ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {members.map((member) => {
          const isRowPending = isPending && pendingProfileId === member.profileId;
          const disableEdit = !canEdit || isRowPending;
          return (
            <li key={member.profileId} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-foreground">{member.fullName}</p>
                <p className="text-xs text-muted-foreground">{member.email || member.profileId}</p>
                <p className="text-xs text-muted-foreground">
                  Joined {member.joinedAt ? joinedLabel.format(new Date(member.joinedAt)) : "-"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canEdit ? (
                  <label className="text-xs text-muted-foreground">
                    <span className="sr-only">Organization role</span>
                    <select
                      className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                      value={member.orgRole}
                      disabled={disableEdit}
                      onChange={(event) => {
                        const next = event.target.value;
                        if (next === "owner" || next === "staff" || next === "client") {
                          onChangeRole(member.profileId, next);
                        }
                      }}
                    >
                      {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                    {roleLabel[member.orgRole]}
                  </span>
                )}
                {member.appRole ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                    {member.appRole}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
