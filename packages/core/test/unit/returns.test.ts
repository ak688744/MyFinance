import { describe, it, expect } from 'vitest';
import { getPeriodReturns, getPeriodStartDate } from '../../src/domain/returns';
import type {
  InvestmentTxRepo,
  SchemeRepo,
  HoldingsRepo,
} from '../../src/repositories/types';
import type {
  CashFlow,
  InvestmentTransaction,
  NavLookup,
  Scheme,
} from '../../src/types';

// ──────────────────────────────────────────────────────────────
// Fakes — plain objects implementing the repo interfaces, returning
// fixture arrays. No database.
// ──────────────────────────────────────────────────────────────

type TxFixture = {
  schemeId: number | null;
  schemeName?: string;
  accountName?: string;
  investmentApp?: string;
  transactionType: InvestmentTransaction['transactionType'];
  units: number;
  amount: number;
  transactionDate: string;
};

function makeTxRepo(fixtures: TxFixture[]): InvestmentTxRepo {
  const rows: InvestmentTransaction[] = fixtures.map((f, i) => ({
    id: i + 1,
    schemeId: f.schemeId,
    schemeName: f.schemeName ?? 'Scheme',
    accountName: f.accountName ?? 'ACC',
    investmentApp: f.investmentApp ?? 'Groww',
    transactionType: f.transactionType,
    units: f.units,
    nav: f.amount / (f.units || 1),
    amount: f.amount,
    transactionDate: f.transactionDate,
  }));

  function applyFilters(
    list: InvestmentTransaction[],
    filters: { account?: string; schemeId?: number; startDate?: string; endDate?: string },
  ): InvestmentTransaction[] {
    return list.filter((r) => {
      if (filters.account !== undefined && r.accountName !== filters.account) return false;
      if (filters.schemeId !== undefined && r.schemeId !== filters.schemeId) return false;
      if (filters.startDate && filters.endDate) {
        if (r.transactionDate < filters.startDate || r.transactionDate > filters.endDate) return false;
      } else if (filters.startDate) {
        if (r.transactionDate < filters.startDate) return false;
      } else if (filters.endDate) {
        if (r.transactionDate > filters.endDate) return false;
      }
      return true;
    });
  }

  return {
    getTransactions(filters = {}) {
      return applyFilters(rows, filters)
        .slice()
        .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
    },
    getTransactionsByScheme(schemeId) {
      return rows.filter((r) => r.schemeId === schemeId);
    },
    getCashFlows(filters = {}) {
      return applyFilters(rows, filters)
        .slice()
        .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate))
        .map<CashFlow>((r) => ({
          date: r.transactionDate,
          amount:
            r.transactionType === 'PURCHASE' || r.transactionType === 'SWITCH_IN'
              ? -r.amount
              : r.amount,
        }));
    },
    getTransactionSummary() {
      throw new Error('not used');
    },
    getEarliestTransactionDate(filters) {
      const matched = applyFilters(rows, {
        account: filters.account,
        schemeId: filters.schemeId,
      });
      if (matched.length === 0) return null;
      return matched.reduce(
        (min, r) => (r.transactionDate < min ? r.transactionDate : min),
        matched[0].transactionDate,
      );
    },
    getUnitsPerSchemeUpTo(endDate, filters) {
      const map = new Map<number, number>();
      const matched = applyFilters(rows, { account: filters.account, endDate })
        .filter((r) => r.schemeId !== null)
        .slice()
        .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
      for (const r of matched) {
        const id = r.schemeId as number;
        const cur = map.get(id) ?? 0;
        if (r.transactionType === 'PURCHASE' || r.transactionType === 'SWITCH_IN') {
          map.set(id, cur + r.units);
        } else if (r.transactionType === 'REDEMPTION' || r.transactionType === 'SWITCH_OUT') {
          map.set(id, Math.max(0, cur - r.units));
        }
      }
      return map;
    },
    getTransactionsWithSchemeMeta() {
      throw new Error('not used in returns tests');
    },
    getAccounts() {
      throw new Error('not used in returns tests');
    },
    insert() {
      throw new Error('not used');
    },
    deleteByAccountAppDateRange() {
      throw new Error('not used');
    },
  };
}

function makeSchemeRepo(schemes: Record<number, Scheme>): SchemeRepo {
  return {
    getSchemeById: (id) => schemes[id] ?? null,
    getSchemes: () => [],
    findSchemeByName: () => null,
    getSchemesWithAmfi: () =>
      Object.values(schemes)
        .filter((s) => s.amfiCode !== null)
        .map((s) => ({ schemeId: s.id, amfiCode: s.amfiCode as string })),
    getUnmatchedSchemes: () =>
      Object.values(schemes).filter((s) => s.amfiCode === null),
    updateAmfiCode: () => {},
    matchOrCreateScheme: () => 0,
  };
}

function makeHoldingsRepo(value: { currentValue: number; investedValue: number }): HoldingsRepo {
  return {
    getHoldingsValue: () => value,
    insert: () => 0,
    deleteByAccountAppDate: () => 0,
  };
}

function makeNav(opts: {
  latest?: Record<string, number | null>;
  forDate?: Record<string, { date: string; nav: number } | null>;
}): NavLookup {
  return {
    getLatestNAV: async (code) => opts.latest?.[code] ?? null,
    getNAVForDate: async (code) => opts.forDate?.[code] ?? null,
  };
}

const TODAY = new Date(2025, 0, 1); // 2025-01-01, deterministic

describe('getPeriodStartDate', () => {
  it('subtracts the right interval for each period', () => {
    const t = new Date(2025, 5, 15); // 2025-06-15
    expect(getPeriodStartDate('1M', t).getMonth()).toBe(4); // May
    expect(getPeriodStartDate('1Y', t).getFullYear()).toBe(2024);
    expect(getPeriodStartDate('5Y', t).getFullYear()).toBe(2020);
    expect(getPeriodStartDate('ALL', t).getFullYear()).toBe(1900);
  });
});

describe('getPeriodReturns', () => {
  it('returns all-zero result when there are no transactions (ALL)', async () => {
    const deps = {
      txRepo: makeTxRepo([]),
      schemeRepo: makeSchemeRepo({}),
      holdingsRepo: makeHoldingsRepo({ currentValue: 0, investedValue: 0 }),
      nav: makeNav({}),
    };
    const r = await getPeriodReturns(deps, { period: 'ALL', today: TODAY });
    expect(r.startValue).toBe(0);
    expect(r.endValue).toBe(0);
    expect(r.investedInPeriod).toBe(0);
    expect(r.xirr).toBeNull();
  });

  it('ALL period: single scheme with NAV produces gain + non-null xirr', async () => {
    // Bought 100 units for 1000 on 2024-01-01. Latest NAV 15 -> value 1500.
    const txRepo = makeTxRepo([
      {
        schemeId: 1,
        transactionType: 'PURCHASE',
        units: 100,
        amount: 1000,
        transactionDate: '2024-01-01',
      },
    ]);
    const schemeRepo = makeSchemeRepo({
      1: {
        id: 1,
        schemeName: 'S1',
        amfiCode: '100',
        isin: null,
        amcName: 'AMC',
        category: 'equity',
        subCategory: null,
      },
    });
    const nav = makeNav({
      latest: { '100': 15 },
      forDate: { '100': { date: '2024-01-01', nav: 10 } },
    });
    const deps = {
      txRepo,
      schemeRepo,
      holdingsRepo: makeHoldingsRepo({ currentValue: 0, investedValue: 0 }),
      nav,
    };

    const r = await getPeriodReturns(deps, { period: 'ALL', schemeId: 1, today: TODAY });

    // startDate = earliest tx = 2024-01-01; start position is day-before -> 0 units.
    expect(r.startDate).toBe('2024-01-01');
    expect(r.endDate).toBe('2025-01-01');
    expect(r.investedInPeriod).toBe(1000);
    // No units before start -> startValue 0; endValue = 100 * 15 = 1500.
    expect(r.startValue).toBe(0);
    expect(r.endValue).toBe(1500);
    expect(r.returns).toBe(500); // 1500 - 0 - 1000
    expect(r.returnsPercent).toBeCloseTo(50, 5); // 500 / (0 + 1000) * 100
    expect(r.xirr).not.toBeNull();
    expect(r.xirr as number).toBeGreaterThan(0);
  });

  it('falls back to holdings value when NAV is unavailable', async () => {
    const txRepo = makeTxRepo([
      {
        schemeId: 1,
        transactionType: 'PURCHASE',
        units: 100,
        amount: 1000,
        transactionDate: '2024-01-01',
      },
    ]);
    const schemeRepo = makeSchemeRepo({
      1: {
        id: 1,
        schemeName: 'S1',
        amfiCode: '100',
        isin: null,
        amcName: 'AMC',
        category: 'equity',
        subCategory: null,
      },
    });
    // NAV returns null for both lookups -> useNAV stays false -> holdings fallback.
    const nav = makeNav({ latest: { '100': null }, forDate: { '100': null } });
    const deps = {
      txRepo,
      schemeRepo,
      holdingsRepo: makeHoldingsRepo({ currentValue: 1200, investedValue: 1000 }),
      nav,
    };

    const r = await getPeriodReturns(deps, { period: 'ALL', schemeId: 1, today: TODAY });

    // holdings fallback: endValue = currentValue (1200). startValue scaled by
    // growthRatio (1200/1000) applied to startPosition.investedValue (0) -> 0.
    expect(r.endValue).toBe(1200);
    expect(r.startValue).toBe(0);
    expect(r.returns).toBe(200); // 1200 - 0 - 1000
  });
});
