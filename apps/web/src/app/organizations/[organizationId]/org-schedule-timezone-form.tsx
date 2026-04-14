"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { updateOrganizationScheduleTimezoneAction } from "@/app/actions/organization";
import { Button } from "@/components/ui/button";
import { ORGANIZATION_TIMEZONE_OPTIONS } from "@/lib/iana-timezone-options";
import { isSupabaseConfigured } from "@/lib/env";

type OrgScheduleTimezoneFormProps = {
  organizationId: string;
  initialTimezone: string;
};

export function OrgScheduleTimezoneForm({ organizationId, initialTimezone }: OrgScheduleTimezoneFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialTimezone);
  const choices = useMemo(() => {
    if (ORGANIZATION_TIMEZONE_OPTIONS.some((o) => o.value === initialTimezone)) {
      return ORGANIZATION_TIMEZONE_OPTIONS;
    }
    return [{ value: initialTimezone, label: `${initialTimezone} (current)` }, ...ORGANIZATION_TIMEZONE_OPTIONS];
  }, [initialTimezone]);

  useEffect(() => {
    setValue(initialTimezone);
  }, [initialTimezone]);

  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      if (!isSupabaseConfigured()) {
        setMessage("Supabase is not configured.");
        setIsError(true);
        return;
      }
      const res = await updateOrganizationScheduleTimezoneAction(organizationId, value);
      if (!res.ok) {
        setMessage(res.error);
        setIsError(true);
        return;
      }
      setIsError(false);
      setMessage("Saved.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label htmlFor="org-schedule-tz" className="mb-1 block text-xs font-medium text-muted-foreground">
          Schedule timezone
        </label>
        <select
          id="org-schedule-tz"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
          disabled={pending}
        >
          {choices.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Weekly class times and attendance dates use this zone (not your computer&apos;s clock).
        </p>
      </div>
      <Button type="submit" disabled={pending || value === initialTimezone}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {message ? (
        <p className={`text-sm sm:ml-2 ${isError ? "text-destructive" : "text-muted-foreground"}`} role={isError ? "alert" : "status"}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
