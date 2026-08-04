export type InsightType = 'needs_clarity' | 'new_spend' | 'abnormal_spend';
export type Insight = {
  id: string;
  type: InsightType;
  severity: 'info' | 'warn';
  title: string;
  detail: string;
  transactionIds: number[];
  cta: { label: string };
};

export type InsightTxn = {
  id: number; transactionDate: string; description: string; amount: number;
  direction: 'debit' | 'credit'; categoryId: string | null; tags: { tag: string }[];
};
export type InsightInput = {
  month: string;
  monthTxns: InsightTxn[];
  priorTxns: InsightTxn[];
  byCategoryThisMonth: { categoryId: string | null; amount: number }[];
  byCategoryPriorMonths: { month: string; categoryId: string | null; amount: number }[];
  deriveMerchantName: (description: string) => string | null;
};

export const LOOKBACK_MONTHS = 3;
export const NEW_SPEND_MIN_INR = 500;
export const NEW_SPEND_TOP_N = 5;
export const ABNORMAL_RATIO = 1.4;
export const ABNORMAL_MIN_JUMP_INR = 1000;

const merchantKeyOf = (d: string, derive: (s: string) => string | null): string =>
  (derive(d) ?? d).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export function computeExpenseInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];

  // 1) needs_clarity
  const flagged = input.monthTxns.filter((t) =>
    t.direction === 'debit' &&
    (t.tags?.length ?? 0) === 0 &&
    (t.categoryId === null || input.deriveMerchantName(t.description) === null),
  );
  if (flagged.length > 0) {
    out.push({
      id: `needs-clarity:${input.month}`,
      type: 'needs_clarity',
      severity: 'info',
      title: `${flagged.length} transaction${flagged.length === 1 ? '' : 's'} need clarity`,
      detail: 'Uncategorized or unclear transactions this month. Review them so every rupee is understood.',
      transactionIds: flagged.map((t) => t.id),
      cta: { label: 'Review in chat' },
    });
  }

  // 2) new_spend
  const seen = new Set(input.priorTxns.filter((t) => t.direction === 'debit').map((t) => merchantKeyOf(t.description, input.deriveMerchantName)));
  const byMerchant = new Map<string, { total: number; ids: number[]; label: string }>();
  for (const t of input.monthTxns) {
    if (t.direction !== 'debit') continue;
    const key = merchantKeyOf(t.description, input.deriveMerchantName);
    if (!key || seen.has(key)) continue;
    const cur = byMerchant.get(key) ?? { total: 0, ids: [], label: input.deriveMerchantName(t.description) ?? t.description };
    cur.total += t.amount; cur.ids.push(t.id);
    byMerchant.set(key, cur);
  }
  const newCards = [...byMerchant.entries()]
    .filter(([, v]) => v.total >= NEW_SPEND_MIN_INR)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, NEW_SPEND_TOP_N)
    .map(([key, v]): Insight => ({
      id: `new-spend:merchant:${key}`,
      type: 'new_spend',
      severity: 'info',
      title: `New spending: ${v.label}`,
      detail: `₹${Math.round(v.total)} at ${v.label}, not seen in the previous ${LOOKBACK_MONTHS} months.`,
      transactionIds: v.ids,
      cta: { label: 'Review in chat' },
    }));
  out.push(...newCards);

  // 3) abnormal_spend
  const priorByCat = new Map<string, number[]>();
  for (const r of input.byCategoryPriorMonths) {
    if (r.categoryId === null) continue;
    const arr = priorByCat.get(r.categoryId) ?? []; arr.push(r.amount); priorByCat.set(r.categoryId, arr);
  }
  for (const cur of input.byCategoryThisMonth) {
    if (cur.categoryId === null) continue;
    const priors = priorByCat.get(cur.categoryId) ?? [];
    if (priors.length === 0) continue;
    const avg = priors.reduce((a, b) => a + b, 0) / priors.length;
    if (avg <= 0) continue;
    const ratio = cur.amount / avg;
    const jump = cur.amount - avg;
    if (ratio > ABNORMAL_RATIO && jump >= ABNORMAL_MIN_JUMP_INR) {
      const pct = Math.round((ratio - 1) * 100);
      out.push({
        id: `abnormal-spend:${cur.categoryId}:${input.month}`,
        type: 'abnormal_spend',
        severity: 'warn',
        title: `${cur.categoryId} spend is up ${pct}%`,
        detail: `₹${Math.round(cur.amount)} this month vs a ₹${Math.round(avg)} ${LOOKBACK_MONTHS}-month average.`,
        transactionIds: input.monthTxns.filter((t) => t.categoryId === cur.categoryId && t.direction === 'debit').map((t) => t.id),
        cta: { label: 'Review in chat' },
      });
    }
  }

  return out;
}
