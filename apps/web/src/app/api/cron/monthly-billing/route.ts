import { NextResponse } from "next/server";
import { runMonthlyStripeInvoices } from "@/app/actions/billing";

/**
 * Schedule with Vercel Cron (1st of month) or external scheduler.
 * Production: `CRON_SECRET` must be set; request must send `Authorization: Bearer <CRON_SECRET>`.
 * Development: if `CRON_SECRET` is unset, the route is callable without auth (local only).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const auth = request.headers.get("authorization");
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!secret) {
      return NextResponse.json(
        { error: "Cron misconfiguration: set CRON_SECRET in production" },
        { status: 503 },
      );
    }
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (secret && auth !== `Bearer ${secret}`) {
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
