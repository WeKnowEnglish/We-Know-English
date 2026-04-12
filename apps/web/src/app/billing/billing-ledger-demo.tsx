"use client";

import { useMemo, useState } from "react";
import { buildInvoiceSummary, calculateBalance, createSessionCredit, type LedgerEntry } from "@/lib/ledger";

const initialEntries: LedgerEntry[] = [
  {
    id: "led_1",
    payerId: "payer_1",
    type: "charge",
    amountCents: 120000,
    description: "March tuition",
    createdAt: new Date().toISOString(),
  },
  {
    id: "led_2",
    payerId: "payer_1",
    type: "payment",
    amountCents: 80000,
    description: "Bank transfer",
    createdAt: new Date().toISOString(),
  },
];

export function BillingLedgerDemo() {
  const [entries, setEntries] = useState(initialEntries);

  const totals = useMemo(() => {
    const invoice = buildInvoiceSummary(entries);
    return {
      ...invoice,
      balance: calculateBalance(entries),
    };
  }, [entries]);

  const issueCredit = () => {
    setEntries((current) => [
      createSessionCredit("payer_1", 20000, "Tutor canceled session on Tuesday"),
      ...current,
    ]);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">Demo ledger</h2>
      <p className="text-sm text-muted-foreground">
        Local-only sample until payer balances are loaded from Supabase.
      </p>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-4">
        <div className="text-sm">Charges: ${(totals.charges / 100).toFixed(2)}</div>
        <div className="text-sm">Payments: ${(totals.payments / 100).toFixed(2)}</div>
        <div className="text-sm">Credits: ${(totals.credits / 100).toFixed(2)}</div>
        <div className="text-sm font-medium">Due: ${(totals.due / 100).toFixed(2)}</div>
      </div>

      <button
        type="button"
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
        onClick={issueCredit}
      >
        Issue Session Credit
      </button>

      <div className="rounded-xl border border-border bg-card">
        {entries.map((entry) => (
          <article
            key={entry.id}
            className="flex items-center justify-between border-b border-border p-4 text-sm last:border-b-0"
          >
            <div>
              <p className="font-medium capitalize">{entry.type}</p>
              <p className="text-muted-foreground">{entry.description}</p>
            </div>
            <p>${(entry.amountCents / 100).toFixed(2)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
