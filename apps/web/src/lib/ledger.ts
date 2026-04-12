export type LedgerEntryType = "charge" | "payment" | "credit" | "adjustment";

export type LedgerEntry = {
  id: string;
  payerId: string;
  type: LedgerEntryType;
  amountCents: number;
  description: string;
  createdAt: string;
};

export function calculateBalance(entries: LedgerEntry[]) {
  return entries.reduce((acc, entry) => {
    if (entry.type === "charge") return acc + entry.amountCents;
    return acc - entry.amountCents;
  }, 0);
}

export function createSessionCredit(
  payerId: string,
  amountCents: number,
  reason: string,
): LedgerEntry {
  return {
    id: crypto.randomUUID(),
    payerId,
    type: "credit",
    amountCents,
    description: `Session credit: ${reason}`,
    createdAt: new Date().toISOString(),
  };
}

export function buildInvoiceSummary(entries: LedgerEntry[]) {
  const charges = entries
    .filter((entry) => entry.type === "charge")
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  const payments = entries
    .filter((entry) => entry.type === "payment")
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  const credits = entries
    .filter((entry) => entry.type === "credit")
    .reduce((sum, entry) => sum + entry.amountCents, 0);

  return {
    charges,
    payments,
    credits,
    due: charges - payments - credits,
  };
}
