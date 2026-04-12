import Link from "next/link";
import { BillingLedgerDemo } from "@/app/billing/billing-ledger-demo";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function BillingPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Attendance-driven tuition rules and family ledger tools. Production charges will use finalized sessions from
          Supabase.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How attendance affects charges</CardTitle>
          <CardDescription>Aligned with `attendance_records.status` after you finalize a session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>
              <strong className="text-foreground">Billable</strong> for a scheduled session: present, late, and{" "}
              <strong className="text-foreground">unexcused absence</strong>.
            </li>
            <li>
              <strong className="text-foreground">Not billed</strong> for that session when the mark is an{" "}
              <strong className="text-foreground">excused absence</strong>.
            </li>
            <li>Only sessions with attendance marked <strong className="text-foreground">Finalized</strong> should feed automated billing.</li>
          </ul>
          <p className="pt-2">
            The monthly Stripe helper will aggregate per parent using enrollments and rates — see{" "}
            <code className="rounded bg-muted px-1 text-xs">loadBillableSummariesForPeriod</code> in the codebase.
          </p>
          <Link href="/billing/monthly" className={cn(buttonVariants({ variant: "default", size: "sm" }), "mt-3 inline-flex w-fit")}>
            Open monthly Stripe run
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance report</CardTitle>
          <CardDescription>Export marks for accounting or audits.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/attendance/report" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "inline-flex")}>
            Go to attendance report
          </Link>
        </CardContent>
      </Card>

      <BillingLedgerDemo />
    </main>
  );
}
