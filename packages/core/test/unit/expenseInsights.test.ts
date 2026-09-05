import { describe, it, expect } from 'vitest';
import { computeExpenseInsights, merchantKeyOf } from '../../src/domain/insights/expenseInsights';

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
  it('needs_clarity: one card PER material unknown txn; skips tagged/clean/immaterial/self-explanatory', () => {
    const input = { ...base(), monthTxns: [
      { id: 1, transactionDate: '2026-08-02', description: 'UPI-SWIGGY', amount: 800, direction: 'debit' as const, categoryId: null, tags: [] },        // uncategorized debit → flag
      { id: 2, transactionDate: '2026-08-03', description: 'RANDOM NOISE', amount: 500, direction: 'debit' as const, categoryId: 'food', tags: [] },     // vague categorized (derive→null) → flag
      { id: 3, transactionDate: '2026-08-04', description: 'UPI-ZOMATO', amount: 800, direction: 'debit' as const, categoryId: null, tags: [{ tag: 'x' }] }, // tagged → skip
      { id: 4, transactionDate: '2026-08-05', description: 'UPI-AMAZON', amount: 600, direction: 'debit' as const, categoryId: 'shopping', tags: [] },   // clean merchant → skip
      { id: 5, transactionDate: '2026-08-06', description: 'UPI-SHIKHA', amount: 23500, direction: 'credit' as const, categoryId: null, tags: [] },      // uncategorized CREDIT → flag (inflow)
      { id: 6, transactionDate: '2026-08-07', description: 'NEFT COURSERA', amount: 345733, direction: 'credit' as const, categoryId: 'salary', tags: [] }, // self-explanatory → skip
      { id: 7, transactionDate: '2026-08-08', description: 'HDFC BANK DIV', amount: 52, direction: 'credit' as const, categoryId: 'investment', tags: [] }, // below floor → skip
      { id: 8, transactionDate: '2026-08-09', description: 'UPI-XXXXXXX7204-SBIN-9999-RENT', amount: 60000, direction: 'debit' as const, categoryId: 'rent', tags: [] }, // self-explanatory → skip
    ] };
    const clarity = computeExpenseInsights(input).filter((i) => i.type === 'needs_clarity');
    // per-item: one card each for 1, 2, 5 only
    expect(clarity.map((c) => c.transactionIds[0]).sort((a, b) => a - b)).toEqual([1, 2, 5]);
    expect(clarity.every((c) => c.transactionIds.length === 1)).toBe(true);
    expect(clarity.map((c) => c.id).sort()).toEqual(['needs-clarity:2026-08:1', 'needs-clarity:2026-08:2', 'needs-clarity:2026-08:5']);
  });

  it('needs_clarity: material amount floor and self-explanatory categories suppress the ask', () => {
    const input = { ...base(), monthTxns: [
      { id: 20, transactionDate: '2026-08-02', description: 'DC INTL POS TXN MARKUP', amount: 23, direction: 'debit' as const, categoryId: 'bills', tags: [] },    // below floor → skip
      { id: 21, transactionDate: '2026-08-03', description: 'NEFT CR COURSERA', amount: 345733, direction: 'credit' as const, categoryId: 'salary', tags: [] },     // salary self-explanatory → skip
      { id: 22, transactionDate: '2026-08-04', description: 'UPI-MASKED-RENT', amount: 60000, direction: 'debit' as const, categoryId: 'rent', tags: [] },           // rent self-explanatory → skip
      { id: 23, transactionDate: '2026-08-05', description: 'UPI-MASKED-INVEST', amount: 15000, direction: 'debit' as const, categoryId: 'investment', tags: [] },   // investment ambiguous cadence → FLAG
    ], deriveMerchantName: () => null };
    const clarity = computeExpenseInsights(input).filter((i) => i.type === 'needs_clarity');
    expect(clarity.map((c) => c.transactionIds[0])).toEqual([23]);
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

  // Regression: recurring UPI rent/SIP have a UNIQUE per-txn reference number in
  // the description; when no clean merchant name is derivable the fallback key
  // must strip that volatile ref so the same payee matches across months and is
  // NOT re-flagged as new spend every month.
  describe('merchant key stability for recurring UPI payments (ref-number bug)', () => {
    // Mirrors real deriveMerchantName: masked-account UPI payee → null → fallback.
    const maskedDerive = (d: string) =>
      /^UPI-X+\d/.test(d) ? null : (d.startsWith('UPI-') ? d.slice(4).split('-')[0] : null);

    it('same rent, different monthly ref numbers → identical merchant key', () => {
      const aug = 'UPI-XXXXXXX7204-SBIN0031861-127497190794-RENT';
      const jul = 'UPI-XXXXXXX7204-SBIN0031861-125676426590-RENT';
      expect(merchantKeyOf(aug, maskedDerive)).toBe(merchantKeyOf(jul, maskedDerive));
      // the 12-digit ref is gone, stable parts remain
      expect(merchantKeyOf(aug, maskedDerive)).toBe('UPIXXXXXXX7204SBIN0031861RENT');
    });

    it('recurring rent paid last month is NOT flagged as new_spend this month', () => {
      const input = { ...base(), deriveMerchantName: maskedDerive,
        monthTxns: [
          { id: 977, transactionDate: '2026-08-07', description: 'UPI-XXXXXXX7204-SBIN0031861-127497190794-RENT', amount: 60000, direction: 'debit' as const, categoryId: 'rent', tags: [] },
        ],
        priorTxns: [
          { id: 800, transactionDate: '2026-07-05', description: 'UPI-XXXXXXX7204-SBIN0031861-125676426590-RENT', amount: 60000, direction: 'debit' as const, categoryId: 'rent', tags: [] },
        ],
      };
      const newSpend = computeExpenseInsights(input).filter((i) => i.type === 'new_spend');
      expect(newSpend).toHaveLength(0);
    });

    it('a genuinely new payee is still flagged', () => {
      const input = { ...base(), deriveMerchantName: maskedDerive,
        monthTxns: [
          { id: 1, transactionDate: '2026-08-07', description: 'UPI-XXXXXXX9999-HDFC0001234-999999999999-RENT', amount: 60000, direction: 'debit' as const, categoryId: 'rent', tags: [] },
        ],
        priorTxns: [
          { id: 800, transactionDate: '2026-07-05', description: 'UPI-XXXXXXX7204-SBIN0031861-125676426590-RENT', amount: 60000, direction: 'debit' as const, categoryId: 'rent', tags: [] },
        ],
      };
      const newSpend = computeExpenseInsights(input).filter((i) => i.type === 'new_spend');
      expect(newSpend).toHaveLength(1);
    });
  });
});
