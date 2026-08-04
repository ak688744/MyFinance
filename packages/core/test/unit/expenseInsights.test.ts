import { describe, it, expect } from 'vitest';
import { computeExpenseInsights } from '../../src/domain/insights/expenseInsights';

const derive = (d: string) => (d.startsWith('UPI-') ? d.slice(4).split(/[ /]/)[0] : (/^[A-Z ]+$/.test(d) ? null : d));

function base() {
  return {
    month: '2026-08',
    monthTxns: [] as any[],
    priorTxns: [] as any[],
    byCategoryThisMonth: [] as any[],
    byCategoryPriorMonths: [] as any[],
    deriveMerchantName: derive,
  };
}

describe('computeExpenseInsights', () => {
  it('needs_clarity: flags uncategorized OR vague, skips tagged, one grouped card', () => {
    const input = { ...base(), monthTxns: [
      { id: 1, transactionDate: '2026-08-02', description: 'UPI-SWIGGY', amount: 100, direction: 'debit' as const, categoryId: null, tags: [] },       // uncategorized → flag
      { id: 2, transactionDate: '2026-08-03', description: 'RANDOM NOISE', amount: 50, direction: 'debit' as const, categoryId: 'food', tags: [] },     // vague (derive→null) → flag
      { id: 3, transactionDate: '2026-08-04', description: 'UPI-ZOMATO', amount: 80, direction: 'debit' as const, categoryId: null, tags: [{ tag: 'x' }] }, // tagged → skip
      { id: 4, transactionDate: '2026-08-05', description: 'UPI-AMAZON', amount: 60, direction: 'debit' as const, categoryId: 'shopping', tags: [] },   // clean → skip
    ] };
    const out = computeExpenseInsights(input);
    const clarity = out.filter((i) => i.type === 'needs_clarity');
    expect(clarity).toHaveLength(1);
    expect(clarity[0].transactionIds.sort()).toEqual([1, 2]);
    expect(clarity[0].id).toBe('needs-clarity:2026-08');
  });

  it('new_spend: merchant not in prior months, above floor, capped/sorted by amount', () => {
    const input = { ...base(),
      monthTxns: [
        { id: 10, transactionDate: '2026-08-02', description: 'UPI-ACMEGYM', amount: 2400, direction: 'debit' as const, categoryId: 'fitness', tags: [] },
        { id: 11, transactionDate: '2026-08-03', description: 'UPI-TINYSHOP', amount: 100, direction: 'debit' as const, categoryId: 'shopping', tags: [] }, // below 500 floor
        { id: 12, transactionDate: '2026-08-04', description: 'UPI-SWIGGY', amount: 900, direction: 'debit' as const, categoryId: 'food', tags: [] },       // seen before → not new
      ],
      priorTxns: [
        { id: 1, transactionDate: '2026-07-10', description: 'UPI-SWIGGY', amount: 300, direction: 'debit' as const, categoryId: 'food', tags: [] },
      ],
    };
    const out = computeExpenseInsights(input).filter((i) => i.type === 'new_spend');
    expect(out).toHaveLength(1);
    expect(out[0].transactionIds).toContain(10);
    expect(out[0].id).toContain('ACMEGYM');
  });

  it('abnormal_spend: needs BOTH ratio>1.4 AND absolute jump>=1000', () => {
    const input = { ...base(),
      byCategoryThisMonth: [
        { categoryId: 'food', amount: 6000 },     // avg 3000 → ratio 2.0, jump 3000 → FLAG
        { categoryId: 'coffee', amount: 200 },    // avg 120 → ratio 1.67 but jump 80 < 1000 → no flag
      ],
      byCategoryPriorMonths: [
        { month: '2026-05', categoryId: 'food', amount: 3000 },
        { month: '2026-06', categoryId: 'food', amount: 3000 },
        { month: '2026-07', categoryId: 'food', amount: 3000 },
        { month: '2026-05', categoryId: 'coffee', amount: 120 },
        { month: '2026-06', categoryId: 'coffee', amount: 120 },
        { month: '2026-07', categoryId: 'coffee', amount: 120 },
      ],
    };
    const out = computeExpenseInsights(input).filter((i) => i.type === 'abnormal_spend');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('abnormal-spend:food:2026-08');
    expect(out[0].severity).toBe('warn');
  });

  it('empty data → []', () => {
    expect(computeExpenseInsights(base())).toEqual([]);
  });
});
