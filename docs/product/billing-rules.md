# Billing Rules (MVP)

## Billing Unit
- Bill by `payer` (family account), not by individual student.

## Ledger Semantics
- `charge`: increases amount due.
- `payment`: decreases amount due.
- `credit`: decreases amount due and is tied to cancellation/reschedule policy.
- `adjustment`: manual admin correction.

## Session Cancellation Policy
- When tutor cancels, issue session credit instead of refund.
- Credit remains on payer account and applies to next invoice period.
- Credits are tracked as liabilities until applied.

## Invoice Generation
- Invoice period summary = charges - payments - credits.
- Invoice items are generated from ledger entries in period.
- Manual override is allowed via adjustment entries.
