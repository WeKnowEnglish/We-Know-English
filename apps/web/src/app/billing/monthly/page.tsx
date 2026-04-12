"use client";

import { useState, useTransition } from "react";
import { runMonthlyStripeInvoices, type MonthlyBillingResult } from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Receipt } from "lucide-react";

export default function MonthlyBillingPage() {
  const [orgId, setOrgId] = useState("");
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [result, setResult] = useState<MonthlyBillingResult | null>(null);
  const [pending, startTransition] = useTransition();

  const onRun = () => {
    startTransition(async () => {
      const r = await runMonthlyStripeInvoices({
        organizationId: orgId.trim(),
        periodStart: period,
      });
      setResult(r);
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex items-start gap-3">
        <Receipt className="mt-0.5 size-6 text-primary" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monthly Stripe invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Server action: completed sessions + present attendance for the period, one invoice per parent (Stripe).
            Wire <code className="rounded bg-muted px-1 text-xs">loadBillableSummariesForPeriod</code> to Supabase.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run billing</CardTitle>
          <CardDescription>Use a real organization UUID from Supabase in production.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="text-sm font-medium">
            Organization ID
            <input
              className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              placeholder="uuid"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Period start (1st of month)
            <input
              type="date"
              className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </label>
          <Button type="button" disabled={pending} onClick={onRun}>
            {pending ? "Running…" : "Generate invoices"}
          </Button>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{result.ok ? "Result" : "Error"}</CardTitle>
            <CardDescription>{result.message}</CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
