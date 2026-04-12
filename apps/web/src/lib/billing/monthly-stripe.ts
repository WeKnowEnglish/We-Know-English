import Stripe from "stripe";

export type BillableParentSummary = {
  parentId: string;
  stripeCustomerId: string | null;
  sessionCount: number;
  /** Total in smallest currency unit (e.g. cents) */
  amountCents: number;
};

/**
 * Expected query (run via Supabase RPC or server-side SQL):
 * - `sessions` where `status = 'completed'`, `attendance_finalized = true`, and `session_date` in [periodStart, periodEnd)
 * - `attendance_records` for those sessions where `status` is billable:
 *   `present`, `late`, or `absent_unexcused` (exclude `absent_excused`)
 * - join `enrollments` for rate (or `rate_override`), map student → payer via `payer_students` / `students.parent_id`
 *   as your schema dictates
 * Aggregate per payer/parent into session_count and amount.
 *
 * This stub returns an empty list when wired to a real DB — replace with query results.
 */
export async function loadBillableSummariesForPeriod(params: {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<BillableParentSummary[]> {
  void params.organizationId;
  void params.periodStart;
  void params.periodEnd;
  return [];
}

export async function createStripeInvoiceForParent(params: {
  stripe: Stripe;
  customerId: string;
  currency: string;
  description: string;
  amountCents: number;
  metadata?: Stripe.MetadataParam;
}) {
  const invoice = await params.stripe.invoices.create({
    customer: params.customerId,
    collection_method: "send_invoice",
    days_until_due: 14,
    auto_advance: false,
    metadata: params.metadata,
  });

  await params.stripe.invoiceItems.create({
    customer: params.customerId,
    invoice: invoice.id,
    amount: params.amountCents,
    currency: params.currency,
    description: params.description,
  });

  const finalized = await params.stripe.invoices.finalizeInvoice(invoice.id);
  return finalized;
}
