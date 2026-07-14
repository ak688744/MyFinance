import { calculateXIRR, formatDate } from './xirr';
import { getPeriodStartDate } from './returns';
import type { InvestmentTxRepo } from '../repositories/types';
import type {
  AssetAllocation,
  CashFlow,
  Holding,
  NavLookup,
  Period,
  PeriodRedemption,
  PortfolioSummary,
  TransactionWithSchemeMeta,
} from '../types';

/**
 * Portfolio aggregation math, ported verbatim from
 * src/features/investment/services/portfolioService.ts.
 *
 * Structural change vs. RN original: the inline JOIN SQL that read
 * investment_transactions LEFT JOIN investment_schemes (ordered by
 * transaction_date ASC) is replaced by the injected
 * txRepo.getTransactionsWithSchemeMeta. getAccounts' DISTINCT-account SQL maps
 * to txRepo.getAccounts. The ALL-window MIN(transaction_date) maps to
 * txRepo.getEarliestTransactionDate. getLatestNAV is injected (async). ALL
 * arithmetic/branching is reproduced exactly — Groww-validated core logic.
 *
 * formatDate / calculateXIRR reused from ./xirr; getPeriodStartDate from
 * ./returns (not redefined).
 */

type PortfolioDeps = {
  txRepo: InvestmentTxRepo;
  nav: NavLookup;
};

type PortfolioFilters = {
  account?: string;
  asOfDate?: string;
};

type HoldingsFilters = {
  account?: string;
  category?: 'equity' | 'debt' | 'hybrid';
  amc?: string;
  sortBy?: 'currentValue' | 'returns' | 'returnsPercent' | 'xirr' | 'invested';
  sortOrder?: 'asc' | 'desc';
};

type AssetAllocationFilters = {
  account?: string;
};

type GroupKey = string; // `${schemeId}::${accountName}::${investmentApp}`

type HoldingAggregate = {
  schemeId: number;
  schemeName: string;
  accountName: string;
  investmentApp: string;
  amfiCode: string | null;
  amcName: string | null;
  category: 'equity' | 'debt' | 'hybrid' | 'other' | null;
  subCategory: string | null;
  units: number;
  invested: number;
  latestDate: string;
  cashFlows: CashFlow[];
};

/**
 * Group transactions (joined with scheme metadata) by scheme + account + app.
 * Original ran the JOIN SQL inline; now the rows come from
 * txRepo.getTransactionsWithSchemeMeta (already ordered transaction_date ASC).
 */
function aggregateHoldingsFromTransactions(
  txRepo: InvestmentTxRepo,
  filters: { account?: string },
): Map<GroupKey, HoldingAggregate> {
  const rows = txRepo.getTransactionsWithSchemeMeta({ account: filters.account });

  const groups = new Map<GroupKey, HoldingAggregate>();

  for (const row of rows) {
    const key: GroupKey = `${row.schemeId}::${row.accountName}::${row.investmentApp}`;
    let agg = groups.get(key);
    if (!agg) {
      agg = {
        schemeId: row.schemeId,
        schemeName: row.schemeName,
        accountName: row.accountName,
        investmentApp: row.investmentApp,
        amfiCode: row.amfiCode,
        amcName: row.amcName,
        category: row.category,
        subCategory: row.subCategory,
        units: 0,
        invested: 0,
        latestDate: row.transactionDate,
        cashFlows: [],
      };
      groups.set(key, agg);
    }

    if (row.transactionDate > agg.latestDate) {
      agg.latestDate = row.transactionDate;
    }

    switch (row.transactionType) {
      case 'PURCHASE':
        agg.units += row.units;
        agg.invested += row.amount;
        agg.cashFlows.push({ date: row.transactionDate, amount: -row.amount });
        break;
      case 'SWITCH_IN':
        agg.units += row.units;
        agg.invested += row.amount;
        break;
      case 'REDEMPTION':
        agg.units -= row.units;
        agg.invested -= row.amount;
        agg.cashFlows.push({ date: row.transactionDate, amount: row.amount });
        break;
      case 'SWITCH_OUT':
        agg.units -= row.units;
        agg.invested -= row.amount;
        break;
      case 'DIVIDEND':
        agg.cashFlows.push({ date: row.transactionDate, amount: row.amount });
        break;
    }
  }

  return groups;
}

/**
 * Resolve current value and XIRR for each aggregated holding via latest NAV.
 * Touches NAV -> async. `today` injectable for deterministic tests.
 */
async function resolveCurrentValues(
  aggregates: HoldingAggregate[],
  nav: NavLookup,
  today: Date,
): Promise<Holding[]> {
  const todayStr = formatDate(today);
  const navCache = new Map<string, number | null>();

  const holdings: Holding[] = [];

  for (const agg of aggregates) {
    if (agg.units <= 0.0001) continue; // fully redeemed

    let navValue: number | null = null;
    if (agg.amfiCode) {
      if (navCache.has(agg.amfiCode)) {
        navValue = navCache.get(agg.amfiCode)!;
      } else {
        try {
          navValue = await nav.getLatestNAV(agg.amfiCode);
        } catch {
          navValue = null;
        }
        navCache.set(agg.amfiCode, navValue);
      }
    }

    const currentValue =
      navValue !== null ? agg.units * navValue : Math.max(agg.invested, 0);
    const invested = Math.max(agg.invested, 0);
    const returnsAmount = currentValue - invested;
    const returnsPercent = invested > 0 ? (returnsAmount / invested) * 100 : 0;

    let xirr: number | null = null;
    if (navValue !== null && currentValue > 0 && agg.cashFlows.length > 0) {
      const xirrFlows = [
        ...agg.cashFlows,
        { date: todayStr, amount: currentValue },
      ];
      xirr = calculateXIRR(xirrFlows);
    }

    holdings.push({
      id: agg.schemeId,
      schemeId: agg.schemeId,
      schemeName: agg.schemeName,
      amcName: agg.amcName,
      category: agg.category,
      subCategory: agg.subCategory,
      folioNumber: null,
      accountName: agg.accountName,
      investmentApp: agg.investmentApp,
      units: agg.units,
      investedValue: invested,
      currentValue,
      returnsAmount,
      returnsPercent,
      returnsXirr: xirr !== null ? xirr * 100 : null,
      asOfDate: agg.latestDate,
    });
  }

  return holdings;
}

export async function getPortfolioSummary(
  deps: PortfolioDeps,
  filters?: PortfolioFilters,
  today: Date = new Date(),
): Promise<PortfolioSummary> {
  const groups = aggregateHoldingsFromTransactions(deps.txRepo, {
    account: filters?.account,
  });
  const holdings = await resolveCurrentValues(
    Array.from(groups.values()),
    deps.nav,
    today,
  );

  const totalInvested = holdings.reduce((s, h) => s + h.investedValue, 0);
  const totalCurrentValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalReturns = totalCurrentValue - totalInvested;
  const totalReturnsPercent =
    totalInvested > 0 ? (totalReturns / totalInvested) * 100 : 0;

  // Portfolio XIRR: union of all scheme cash flows + total current value today
  let xirr: number | null = null;
  if (holdings.length > 0 && totalCurrentValue > 0) {
    const todayStr = formatDate(today);
    const allFlows: CashFlow[] = [];
    for (const agg of groups.values()) {
      if (agg.units <= 0.0001) continue;
      for (const cf of agg.cashFlows) {
        allFlows.push(cf);
      }
    }
    allFlows.push({ date: todayStr, amount: totalCurrentValue });
    xirr = calculateXIRR(allFlows);
  }

  return {
    totalInvested,
    totalCurrentValue,
    totalReturns,
    totalReturnsPercent,
    xirr,
    holdingsCount: holdings.length,
    totalRedeemed: 0,
  };
}

export async function getHoldings(
  deps: PortfolioDeps,
  filters?: HoldingsFilters,
  today: Date = new Date(),
): Promise<Holding[]> {
  const groups = aggregateHoldingsFromTransactions(deps.txRepo, {
    account: filters?.account,
  });
  let holdings = await resolveCurrentValues(
    Array.from(groups.values()),
    deps.nav,
    today,
  );

  if (filters?.category) {
    holdings = holdings.filter((h) => h.category === filters.category);
  }
  if (filters?.amc) {
    holdings = holdings.filter((h) => h.amcName === filters.amc);
  }

  const sortKey: (h: Holding) => number = (() => {
    switch (filters?.sortBy ?? 'currentValue') {
      case 'currentValue':
        return (h) => h.currentValue;
      case 'returns':
        return (h) => h.returnsAmount;
      case 'returnsPercent':
        return (h) => h.returnsPercent;
      case 'xirr':
        return (h) => h.returnsXirr ?? -Infinity;
      case 'invested':
        return (h) => h.investedValue;
    }
  })();

  const dir = filters?.sortOrder?.toUpperCase() === 'ASC' ? 1 : -1;
  holdings.sort((a, b) => (sortKey(a) - sortKey(b)) * dir);

  return holdings;
}

export async function getAssetAllocation(
  deps: PortfolioDeps,
  filters?: AssetAllocationFilters,
  today: Date = new Date(),
): Promise<AssetAllocation[]> {
  const holdings = await getHoldings(deps, { account: filters?.account }, today);
  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  if (totalValue === 0) return [];

  const byCategory = new Map<string, { value: number; count: number }>();
  for (const h of holdings) {
    const cat = h.category ?? 'other';
    const entry = byCategory.get(cat) ?? { value: 0, count: 0 };
    entry.value += h.currentValue;
    entry.count += 1;
    byCategory.set(cat, entry);
  }

  return Array.from(byCategory.entries())
    .map(([category, { value, count }]) => ({
      category,
      value,
      percentage: (value / totalValue) * 100,
      count,
    }))
    .sort((a, b) => b.value - a.value);
}

export function getAccounts(deps: { txRepo: InvestmentTxRepo }): string[] {
  return deps.txRepo.getAccounts();
}

// ──────────────────────────────────────────────────────────────
// Period-scoped queries (cohort view)
// ──────────────────────────────────────────────────────────────

function getWindowStartDate(
  txRepo: InvestmentTxRepo,
  period: Period,
  today: Date,
  filters: { account?: string },
): string {
  if (period !== 'ALL') {
    return formatDate(getPeriodStartDate(period, today));
  }
  // Original: SELECT MIN(transaction_date) ... [WHERE account_name = ?]
  const earliest = txRepo.getEarliestTransactionDate({ account: filters.account });
  return earliest ?? formatDate(today);
}

type PeriodAggregate = HoldingAggregate & {
  purchasedInWindow: number; // PURCHASE + SWITCH_IN amounts
  redeemedInWindow: number; // REDEMPTION + SWITCH_OUT amounts (holdings view)
  purePurchased: number; // PURCHASE only (summary view)
  pureRedeemed: number; // REDEMPTION only (summary view)
  unitsInWindow: number; // net units added in window (purchases − redemptions)
  latestRedemptionDate: string | null;
};

function aggregateTransactionsInWindow(
  txRepo: InvestmentTxRepo,
  window: { startDate: string; endDate: string },
  filters: { account?: string },
): Map<GroupKey, PeriodAggregate> {
  const rows = txRepo.getTransactionsWithSchemeMeta({
    account: filters.account,
    startDate: window.startDate,
    endDate: window.endDate,
  });

  const groups = new Map<GroupKey, PeriodAggregate>();

  for (const row of rows) {
    const key: GroupKey = `${row.schemeId}::${row.accountName}::${row.investmentApp}`;
    let agg = groups.get(key);
    if (!agg) {
      agg = {
        schemeId: row.schemeId,
        schemeName: row.schemeName,
        accountName: row.accountName,
        investmentApp: row.investmentApp,
        amfiCode: row.amfiCode,
        amcName: row.amcName,
        category: row.category,
        subCategory: row.subCategory,
        units: 0,
        invested: 0,
        latestDate: row.transactionDate,
        cashFlows: [],
        purchasedInWindow: 0,
        redeemedInWindow: 0,
        purePurchased: 0,
        pureRedeemed: 0,
        unitsInWindow: 0,
        latestRedemptionDate: null,
      };
      groups.set(key, agg);
    }

    if (row.transactionDate > agg.latestDate) {
      agg.latestDate = row.transactionDate;
    }

    switch (row.transactionType) {
      case 'PURCHASE':
        agg.purchasedInWindow += row.amount;
        agg.purePurchased += row.amount;
        agg.unitsInWindow += row.units;
        agg.cashFlows.push({ date: row.transactionDate, amount: -row.amount });
        break;
      case 'SWITCH_IN':
        agg.purchasedInWindow += row.amount;
        agg.unitsInWindow += row.units;
        agg.cashFlows.push({ date: row.transactionDate, amount: -row.amount });
        break;
      case 'REDEMPTION':
        agg.redeemedInWindow += row.amount;
        agg.pureRedeemed += row.amount;
        agg.unitsInWindow -= row.units;
        agg.cashFlows.push({ date: row.transactionDate, amount: row.amount });
        if (!agg.latestRedemptionDate || row.transactionDate > agg.latestRedemptionDate) {
          agg.latestRedemptionDate = row.transactionDate;
        }
        break;
      case 'SWITCH_OUT':
        agg.redeemedInWindow += row.amount;
        agg.unitsInWindow -= row.units;
        agg.cashFlows.push({ date: row.transactionDate, amount: row.amount });
        break;
      case 'DIVIDEND':
        agg.cashFlows.push({ date: row.transactionDate, amount: row.amount });
        break;
    }
  }

  return groups;
}

export async function getPortfolioSummaryForPeriod(
  deps: PortfolioDeps,
  params: { period: Period; account?: string },
  today: Date = new Date(),
): Promise<PortfolioSummary> {
  const endDate = formatDate(today);
  const startDate = getWindowStartDate(deps.txRepo, params.period, today, {
    account: params.account,
  });

  const groups = aggregateTransactionsInWindow(
    deps.txRepo,
    { startDate, endDate },
    { account: params.account },
  );

  const navCache = new Map<string, number | null>();
  let totalInvested = 0;
  let totalRedeemed = 0;
  let totalCurrentValue = 0;
  let holdingsCount = 0;
  const allFlows: CashFlow[] = [];

  for (const agg of groups.values()) {
    totalInvested += agg.purePurchased; // exclude switches
    totalRedeemed += agg.pureRedeemed;

    let navValue: number | null = null;
    if (agg.amfiCode) {
      if (navCache.has(agg.amfiCode)) {
        navValue = navCache.get(agg.amfiCode)!;
      } else {
        try {
          navValue = await deps.nav.getLatestNAV(agg.amfiCode);
        } catch {
          navValue = null;
        }
        navCache.set(agg.amfiCode, navValue);
      }
    }

    const unitsHeldFromWindow = Math.max(agg.unitsInWindow, 0);
    const currentValue =
      navValue !== null && unitsHeldFromWindow > 0.0001
        ? unitsHeldFromWindow * navValue
        : 0;
    totalCurrentValue += currentValue;

    if (agg.purePurchased > 0 || agg.pureRedeemed > 0 || currentValue > 0) {
      holdingsCount++;
    }

    // Portfolio XIRR: pure cash flows only (no switches)
    for (const cf of agg.cashFlows) {
      allFlows.push(cf);
    }
  }

  // XIRR: add terminal current value as positive flow today
  let xirr: number | null = null;
  if (totalCurrentValue > 0 && allFlows.length > 0) {
    const flowsForXirr = [...allFlows, { date: endDate, amount: totalCurrentValue }];
    xirr = calculateXIRR(flowsForXirr);
  }

  const totalReturns = totalCurrentValue + totalRedeemed - totalInvested;
  const baseForPercent = totalInvested;
  const totalReturnsPercent =
    baseForPercent > 0 ? (totalReturns / baseForPercent) * 100 : 0;

  return {
    totalInvested,
    totalCurrentValue,
    totalReturns,
    totalReturnsPercent,
    xirr,
    holdingsCount,
    totalRedeemed,
  };
}

export async function getHoldingsForPeriod(
  deps: PortfolioDeps,
  params: {
    period: Period;
    account?: string;
    sortBy?: HoldingsFilters['sortBy'];
    sortOrder?: HoldingsFilters['sortOrder'];
    category?: HoldingsFilters['category'];
    amc?: HoldingsFilters['amc'];
  },
  today: Date = new Date(),
): Promise<Holding[]> {
  const endDate = formatDate(today);
  const startDate = getWindowStartDate(deps.txRepo, params.period, today, {
    account: params.account,
  });

  const groups = aggregateTransactionsInWindow(
    deps.txRepo,
    { startDate, endDate },
    { account: params.account },
  );

  const navCache = new Map<string, number | null>();
  const holdings: Holding[] = [];

  for (const agg of groups.values()) {
    // Skip schemes that only had redemptions (they belong to redemption tiles)
    if (agg.unitsInWindow <= 0.0001) continue;
    if (agg.purchasedInWindow <= 0) continue;

    let navValue: number | null = null;
    if (agg.amfiCode) {
      if (navCache.has(agg.amfiCode)) {
        navValue = navCache.get(agg.amfiCode)!;
      } else {
        try {
          navValue = await deps.nav.getLatestNAV(agg.amfiCode);
        } catch {
          navValue = null;
        }
        navCache.set(agg.amfiCode, navValue);
      }
    }

    // Holdings view includes switches in invested (correct scheme-level cost basis)
    const invested = agg.purchasedInWindow;
    const redeemed = agg.redeemedInWindow;
    const currentValue = navValue !== null ? agg.unitsInWindow * navValue : Math.max(invested - redeemed, 0);
    const returnsAmount = currentValue + redeemed - invested;
    const returnsPercent = invested > 0 ? (returnsAmount / invested) * 100 : 0;

    let xirr: number | null = null;
    if (navValue !== null && currentValue > 0 && agg.cashFlows.length > 0) {
      const xirrFlows = [
        ...agg.cashFlows,
        { date: endDate, amount: currentValue },
      ];
      xirr = calculateXIRR(xirrFlows);
    }

    holdings.push({
      id: agg.schemeId,
      schemeId: agg.schemeId,
      schemeName: agg.schemeName,
      amcName: agg.amcName,
      category: agg.category,
      subCategory: agg.subCategory,
      folioNumber: null,
      accountName: agg.accountName,
      investmentApp: agg.investmentApp,
      units: agg.unitsInWindow,
      investedValue: invested,
      currentValue,
      returnsAmount,
      returnsPercent,
      returnsXirr: xirr !== null ? xirr * 100 : null,
      asOfDate: agg.latestDate,
    });
  }

  let filtered = holdings;
  if (params.category) {
    filtered = filtered.filter((h) => h.category === params.category);
  }
  if (params.amc) {
    filtered = filtered.filter((h) => h.amcName === params.amc);
  }

  const sortKey: (h: Holding) => number = (() => {
    switch (params.sortBy ?? 'currentValue') {
      case 'currentValue':
        return (h) => h.currentValue;
      case 'returns':
        return (h) => h.returnsAmount;
      case 'returnsPercent':
        return (h) => h.returnsPercent;
      case 'xirr':
        return (h) => h.returnsXirr ?? -Infinity;
      case 'invested':
        return (h) => h.investedValue;
    }
  })();

  const dir = params.sortOrder?.toUpperCase() === 'ASC' ? 1 : -1;
  filtered.sort((a, b) => (sortKey(a) - sortKey(b)) * dir);

  return filtered;
}

export async function getRedemptionsForPeriod(
  deps: PortfolioDeps,
  params: { period: Period; account?: string },
  today: Date = new Date(),
): Promise<PeriodRedemption[]> {
  const endDate = formatDate(today);
  const startDate = getWindowStartDate(deps.txRepo, params.period, today, {
    account: params.account,
  });

  const groups = aggregateTransactionsInWindow(
    deps.txRepo,
    { startDate, endDate },
    { account: params.account },
  );

  const redemptions: PeriodRedemption[] = [];
  for (const agg of groups.values()) {
    if (agg.pureRedeemed <= 0) continue;
    redemptions.push({
      schemeId: agg.schemeId,
      schemeName: agg.schemeName,
      amcName: agg.amcName,
      accountName: agg.accountName,
      amount: agg.pureRedeemed,
      latestDate: agg.latestRedemptionDate ?? agg.latestDate,
    });
  }

  redemptions.sort((a, b) => b.amount - a.amount);
  return redemptions;
}
