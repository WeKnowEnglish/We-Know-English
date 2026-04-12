"use server";

import Stripe from "stripe";
import { z } from "zod";
import {
  createStripeInvoiceForParent,
  loadBillableSummariesForPeriod,
} from "@/lib/billing/monthly-stripe";

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  /** ISO date for first day of billing month (e.g. previous month’s 1st when cron runs on the 1st) */
  periodStart: z.string(),
});

export type MonthlyBillingResult = {
  ok: boolean;
  message: string;
  invoices: { parentId: string; stripeInvoiceId: string | null; sessionCount: number; amountCents: number }[];
};

/**
 * Smart billing: intended to run on the 1st of each month (e.g. Vercel Cron).
 * Counts completed sessions with present attendance in the billing window and creates Stripe Invoices per parent.
 * Requires STRIPE_SECRET_KEY and profiles.stripe_customer_id for each parent (create customers in onboarding).
 */
export async function runMonthlyStripeInvoices(raw: z.infer<typeof inputSchema>): Promise<MonthlyBillingResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.message, invoices: [] };
  }

  const { organizationId, periodStart } = parsed.data;
  const start = new Date(periodStart);
  if (Number.isNaN(start.getTime())) {
    return { ok: false, message: "Invalid periodStart", invoices: [] };
  }
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return {
      ok: false,
      message: "STRIPE_SECRET_KEY is not set",
      invoices: [],
    };
  }

  const stripe = new Stripe(secret, { apiVersion: "2026-03-25.dahlia" });
  const summaries = await loadBillableSummariesForPeriod({
    organizationId,
    periodStart: start,
    periodEnd: end,
  });

  if (summaries.length === 0) {
    return {
      ok: true,
      message:
        "No billable rows returned (connect loadBillableSummariesForPeriod to your Supabase query).",
      invoices: [],
    };
  }

  const out: MonthlyBillingResult["invoices"] = [];

  for (const row of summaries) {
    if (!row.stripeCustomerId || row.amountCents <= 0 || row.sessionCount <= 0) {
      out.push({
        parentId: row.parentId,
        stripeInvoiceId: null,
        sessionCount: row.sessionCount,
        amountCents: row.amountCents,
      });
      continue;
    }

    const inv = await createStripeInvoiceForParent({
      stripe,
      customerId: row.stripeCustomerId,
      currency: "usd",
      description: `Tuition — ${start.toISOString().slice(0, 7)} (${row.sessionCount} sessions)`,
      amountCents: row.amountCents,
      metadata: { organization_id: organizationId, parent_id: row.parentId },
    });

    out.push({
      parentId: row.parentId,
      stripeInvoiceId: inv.id,
      sessionCount: row.sessionCount,
      amountCents: row.amountCents,
    });
  }

  return {
    ok: true,
    message: `Created ${out.filter((i) => i.stripeInvoiceId).length} Stripe invoice(s).`,
    invoices: out,
  };
}
