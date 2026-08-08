import type { CcLineItem } from '@myfinance/agents';

export type Reconciliation = {
  parsedTotal: number;
  detectedTotal: number | null;
  matched: boolean;
  reconciledAgainst: 'statementTotal' | 'billAmount';
  carryover: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function reconcile(lineItems: CcLineItem[], detectedTotal: number | null, parentAmount: number): Reconciliation {
  const parsedTotal = round2(lineItems.reduce((s, li) => s + li.amount, 0));
  const target = detectedTotal ?? parentAmount;
  const reconciledAgainst = detectedTotal !== null ? 'statementTotal' : 'billAmount';
  const matched = Math.abs(parsedTotal - target) < 1;
  const carryover = round2(parentAmount - (detectedTotal ?? parsedTotal));
  return { parsedTotal, detectedTotal, matched, reconciledAgainst, carryover };
}
