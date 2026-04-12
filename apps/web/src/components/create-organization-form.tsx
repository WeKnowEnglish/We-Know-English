"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createOrganization } from "@/app/actions/organization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

type CreateOrganizationFormProps = {
  /** `page` = full-width first-run layout; `card` = inline block (e.g. Organizations page). */
  variant?: "page" | "card";
};

export function CreateOrganizationForm({ variant = "page" }: CreateOrganizationFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const card = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{variant === "card" ? "Create organization" : "Create your organization"}</CardTitle>
        <CardDescription>
          {variant === "card"
            ? "Add a new center when you need a separate space (different brand, location, or billing). You will be the owner; other teachers request to join from search below, and you approve them on this organization’s page."
            : "Your classes and students belong to an organization. You can create more organizations later from your account settings."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            startTransition(async () => {
              if (!isSupabaseConfigured()) {
                setMessage("Supabase is not configured.");
                return;
              }
              const result = await createOrganization(name);
              if (!result.ok) {
                setMessage(result.error);
                return;
              }
              setName("");
              router.refresh();
            });
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Organization name (e.g. We Know English)"
            required
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Creating…" : "Create organization"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  if (variant === "page") {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-16">
        {card}
      </main>
    );
  }

  return card;
}
