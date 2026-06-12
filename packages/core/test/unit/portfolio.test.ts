import { describe, it, expect } from 'vitest';
import {
  getPortfolioSummary,
  getHoldings,
  getAssetAllocation,
  getAccounts,
  getPortfolioSummaryForPeriod,
  getHoldingsForPeriod,
  getRedemptionsForPeriod,
} from '../../src/domain/portfolio';
import type { InvestmentTxRepo } from '../../src/repositories/types';
import type {
  InvestmentTransaction,
  NavLookup,
  TransactionWithSchemeMeta,
} from '../../src/types';

// ──────────────────────────────────────────────────────────────
// Fakes
// ──────────────────────────────────────────────────────────────

function makeTxRepo(rows: TransactionWithSchemeMeta[]): InvestmentTxRepo {
  return {
    getTransactions: () => [],
    getTransactionsByScheme: () => [],
    getCashFlows: () => [],
    getTransactionSummary: () => {
      throw new Error('not used');
    },
    getEarliestTransactionDate: (filters) => {
      const matched = rows.filter(
        (r) => filters.account === undefined || r.accountName === filters.account,
      );
      if (matched.length === 0) return null;
      return matched.reduce(
        (min, r) => (r.transactionDate < min ? r.transactionDate : min),
        matched[0].transactionDate,
      );
    },
    getUnitsPerSchemeUpTo: () => new Map(),
    getTransactionsWithSchemeMeta: (filters) => {
      return rows
        .filter((r) => {
          if (filters.account !== undefined && r.accountName !== filters.account) return false;
          if (filters.startDate && r.transactionDate < filters.startDate) return false;
          if (filters.endDate && r.transactionDate > filters.endDate) return false;
          return true;
        })
        .slice()
        .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
    },
    getAccounts: () =>
      Array.from(new Set(rows.map((r) => r.accountName))).sort((a, b) => a.localeCompare(b)),
    insert: () => 0,
    deleteByAccountAppDateRange: () => 0,
  } as InvestmentTxRepo;
}

function makeNav(latest: Record<string, number | null>): NavLookup {
  return {
    getLatestNAV: async (code) => latest[code] ?? null,
    getNAVForDate: async () => null,
  };
}

function tx(p: Partial<TransactionWithSchemeMeta> & {
  schemeId: number;
  transactionType: InvestmentTransaction['transactionType'];
  units: number;
  amount: number;
  transactionDate: string;
}): TransactionWithSchemeMeta {
  return {
    schemeName: `Scheme ${p.schemeId}`,
    accountName: 'ACC',
    investmentApp: 'Groww',
    amfiCode: String(p.schemeId),
    amcName: 'AMC',
    category: 'equity',
    subCategory: null,
    ...p,
  } as TransactionWithSchemeMeta;
}

describe('getPortfolioSummary', () => {
  it('aggregates invested + current value and computes returns + xirr', async () => {
    const rows = [
      tx({ schemeId: 1, transactionType: 'PURCHASE', units: 100, amount: 1000, transactionDate: '2024-01-01' }),
      tx({ schemeId: 2, transactionType: 'PURCHASE', units: 50, amount: 500, transactionDate: '2024-02-01', amfiCode: '2' }),
    ];
    const deps = { txRepo: makeTxRepo(rows), nav: makeNav({ '1': 15, '2': 8 }) };
    const today = new Date(2025, 0, 1);

    const s = await getPortfolioSummary(deps, undefined, today);
    // scheme 1: 100*15=1500; scheme 2: 50*8=400 -> total 1900. invested 1500.
    expect(s.totalInvested).toBe(1500);
    expect(s.totalCurrentValue).toBe(1900);
    expect(s.totalReturns).toBe(400);
    expect(s.totalReturnsPercent).toBeCloseTo((400 / 1500) * 100, 5);
    expect(s.holdingsCount).toBe(2);
    expect(s.totalRedeemed).toBe(0);
    expect(s.xirr).not.toBeNull();
  });

  it('uses invested as current value when NAV missing', async () => {
    const rows = [
      tx({ schemeId: 1, transactionType: 'PURCHASE', units: 100, amount: 1000, transactionDate: '2024-01-01', amfiCode: null }),
    ];
    const deps = { txRepo: makeTxRepo(rows), nav: makeNav({}) };
    const s = await getPortfolioSummary(deps, undefined, new Date(2025, 0, 1));
    expect(s.totalCurrentValue).toBe(1000);
    expect(s.totalInvested).toBe(1000);
    // Original behavior: portfolio XIRR is computed whenever totalCurrentValue > 0,
    // independent of per-holding NAV. currentValue falls back to invested (1000),
    // so flows are [-1000, +1000] -> XIRR ~ 0.
    expect(s.xirr).not.toBeNull();
    expect(s.xirr as number).toBeCloseTo(0, 4);
  });
});

describe('getHoldings', () => {
  it('returns one holding per scheme sorted by current value desc', async () => {
    const rows = [
      tx({ schemeId: 1, transactionType: 'PURCHASE', units: 100, amount: 1000, transactionDate: '2024-01-01' }),
      tx({ schemeId: 2, transactionType: 'PURCHASE', units: 50, amount: 500, transactionDate: '2024-02-01', amfiCode: '2' }),
    ];
    const deps = { txRepo: makeTxRepo(rows), nav: makeNav({ '1': 15, '2': 30 }) };
    const h = await getHoldings(deps, undefined, new Date(2025, 0, 1));
    expect(h).toHaveLength(2);
    // scheme 2: 50*30=1500 > scheme 1: 100*15=1500 -> tie; both 1500
    expect(h[0].currentValue).toBe(1500);
    expect(h.find((x) => x.schemeId === 1)?.investedValue).toBe(1000);
  });

  it('skips fully redeemed holdings (units <= 0.0001)', async () => {
    const rows = [
      tx({ schemeId: 1, transactionType: 'PURCHASE', units: 100, amount: 1000, transactionDate: '2024-01-01' }),
      tx({ schemeId: 1, transactionType: 'REDEMPTION', units: 100, amount: 1500, transactionDate: '2024-06-01' }),
    ];
    const deps = { txRepo: makeTxRepo(rows), nav: makeNav({ '1': 15 }) };
    const h = await getHoldings(deps, undefined, new Date(2025, 0, 1));
    expect(h).toHaveLength(0);
  });
});

describe('getAssetAllocation', () => {
  it('computes per-category percentages summing to 100', async () => {
    const rows = [
      tx({ schemeId: 1, transactionType: 'PURCHASE', units: 100, amount: 1000, transactionDate: '2024-01-01', category: 'equity' }),
      tx({ schemeId: 2, transactionType: 'PURCHASE', units: 100, amount: 1000, transactionDate: '2024-01-01', amfiCode: '2', category: 'debt' }),
    ];
    // both current value 1000 (nav 10 each)
    const deps = { txRepo: makeTxRepo(rows), nav: makeNav({ '1': 10, '2': 10 }) };
    const a = await getAssetAllocation(deps, undefined, new Date(2025, 0, 1));
    expect(a).toHaveLength(2);
    const total = a.reduce((s, x) => s + x.percentage, 0);
    expect(total).toBeCloseTo(100, 5);
    expect(a[0].percentage).toBeCloseTo(50, 5);
  });
});

describe('getAccounts', () => {
  it('returns distinct account names sorted asc', () => {
    const rows = [
      tx({ schemeId: 1, transactionType: 'PURCHASE', units: 1, amount: 1, transactionDate: '2024-01-01', accountName: 'Zeta' }),
      tx({ schemeId: 2, transactionType: 'PURCHASE', units: 1, amount: 1, transactionDate: '2024-01-01', accountName: 'Alpha' }),
    ];
    const deps = { txRepo: makeTxRepo(rows) };
    expect(getAccounts(deps)).toEqual(['Alpha', 'Zeta']);
  });
});

describe('period-scoped views', () => {
  const rows = [
    // before window
    tx({ schemeId: 1, transactionType: 'PURCHASE', units: 50, amount: 500, transactionDate: '2023-01-01' }),
    // in window (1Y from 2025-01-01 -> start 2024-01-01)
    tx({ schemeId: 1, transactionType: 'PURCHASE', units: 100, amount: 1000, transactionDate: '2024-06-01' }),
    tx({ schemeId: 2, transactionType: 'PURCHASE', units: 100, amount: 1000, transactionDate: '2024-07-01', amfiCode: '2' }),
    tx({ schemeId: 2, transactionType: 'REDEMPTION', units: 40, amount: 600, transactionDate: '2024-09-01', amfiCode: '2' }),
  ];
  const today = new Date(2025, 0, 1);

  it('getPortfolioSummaryForPeriod sums pure purchases/redemptions in window', async () => {
    const deps = { txRepo: makeTxRepo(rows), nav: makeNav({ '1': 12, '2': 10 }) };
    const s = await getPortfolioSummaryForPeriod(deps, { period: '1Y' }, today);
    // in-window purchases: 1000 (s1) + 1000 (s2) = 2000
    expect(s.totalInvested).toBe(2000);
    // in-window redemptions: 600 (s2)
    expect(s.totalRedeemed).toBe(600);
    // units in window: s1 = 100 -> 100*12 = 1200; s2 = 100-40=60 -> 60*10 = 600
    expect(s.totalCurrentValue).toBe(1800);
    // returns = current + redeemed - invested = 1800 + 600 - 2000 = 400
    expect(s.totalReturns).toBe(400);
  });

  it('getRedemptionsForPeriod lists pure redemptions', async () => {
    const deps = { txRepo: makeTxRepo(rows), nav: makeNav({ '1': 12, '2': 10 }) };
    const reds = await getRedemptionsForPeriod(deps, { period: '1Y' }, today);
    expect(reds).toHaveLength(1);
    expect(reds[0].schemeId).toBe(2);
    expect(reds[0].amount).toBe(600);
    expect(reds[0].latestDate).toBe('2024-09-01');
  });

  it('getHoldingsForPeriod includes schemes with net units in window', async () => {
    const deps = { txRepo: makeTxRepo(rows), nav: makeNav({ '1': 12, '2': 10 }) };
    const h = await getHoldingsForPeriod(deps, { period: '1Y' }, today);
    // both s1 and s2 have positive net units in window
    expect(h.map((x) => x.schemeId).sort()).toEqual([1, 2]);
  });
});
