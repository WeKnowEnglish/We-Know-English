import { NextResponse } from "next/server";
import { runMonthlyStripeInvoices } from "@/app/actions/billing";

/**
 * Schedule with Vercel Cron (1st of month) or external scheduler.
 * Protect with CRON_SECRET in Authorization header.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId required" }, { status: 400 });
  }

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const result = await runMonthlyStripeInvoices({
    organizationId,
    periodStart: periodStart.toISOString().slice(0, 10),
  });

  return NextResponse.json(result);
}
