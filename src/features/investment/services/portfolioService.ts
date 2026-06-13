import type { SQLiteDatabase } from 'expo-sqlite';

import { getLatestNAV } from '../navService';
import {
  calculateXIRR,
  getPeriodStartDate,
  type Period,
} from '../returnsCalculator';

export type PortfolioSummary = {
  totalInvested: number;
  totalCurrentValue: number;
  totalReturns: number;
  totalReturnsPercent: number;
  xirr: number | null;
  holdingsCount: number;
  totalRedeemed: number;
};

export type PeriodRedemption = {
  schemeId: number;
  schemeName: string;
  amcName: string | null;
  accountName: string;
  amount: number;
  latestDate: string;
};

export type Holding = {
  id: number; // synthetic — scheme_id for stable React keys
  schemeId: number | null;
  schemeName: string;
  amcName: string | null;
  category: 'equity' | 'debt' | 'hybrid' | 'other' | null;
  subCategory: string | null;
  folioNumber: string | null; // always null — retained for type compat
  accountName: string;
  investmentApp: string;
  units: number;
  investedValue: number;
  currentValue: number;
  returnsAmount: number;
  returnsPercent: number;
  returnsXirr: number | null;
  asOfDate: string;
};

export type AssetAllocation = {
  category: string;
  value: number;
  percentage: number;
  count: number;
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

type TransactionRow = {
  scheme_id: number;
  scheme_name: string;
  account_name: string;
  investment_app: string;
  transaction_type: string;
  units: number;
  amount: number;
  transaction_date: string;
  amfi_code: string | null;
  amc_name: string | null;
  category: 'equity' | 'debt' | 'hybrid' | 'other' | null;
  sub_category: string | null;
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
  cashFlows: Array<{ date: string; amount: number }>;
};

/**
 * Fetch transactions joined with scheme metadata, grouped by scheme + account.
 */
async function aggregateHoldingsFromTransactions(
  db: SQLiteDatabase,
  filters: { account?: string }
): Promise<Map<GroupKey, HoldingAggregate>> {
  const conditions: string[] = ['t.scheme_id IS NOT NULL'];
  const params: (string | number)[] = [];

  if (filters.account) {
    conditions.push('t.account_name = ?');
    params.push(filters.account);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const rows = await db.getAllAsync<TransactionRow>(
    `
      SELECT
        t.scheme_id,
        t.scheme_name,
        t.account_name,
        t.investment_app,
        t.transaction_type,
        t.units,
        t.amount,
        t.transaction_date,
        s.amfi_code,
        s.amc_name,
        s.category,
        s.sub_category
      FROM investment_transactions t
      LEFT JOIN investment_schemes s ON t.scheme_id = s.id
      ${whereClause}
      ORDER BY t.transaction_date ASC
    `,
    params
  );

  const groups = new Map<GroupKey, HoldingAggregate>();

  for (const row of rows) {
    const key: GroupKey = `${row.scheme_id}::${row.account_name}::${row.investment_app}`;
    let agg = groups.get(key);
    if (!agg) {
      agg = {
        schemeId: row.scheme_id,
        schemeName: row.scheme_name,
        accountName: row.account_name,
        investmentApp: row.investment_app,
        amfiCode: row.amfi_code,
        amcName: row.amc_name,
        category: row.category,
        subCategory: row.sub_category,
        units: 0,
        invested: 0,
        latestDate: row.transaction_date,
        cashFlows: [],
      };
      groups.set(key, agg);
    }

    if (row.transaction_date > agg.latestDate) {
      agg.latestDate = row.transaction_date;
    }

    switch (row.transaction_type) {
      case 'PURCHASE':
        agg.units += row.units;
        agg.invested += row.amount;
        agg.cashFlows.push({ date: row.transaction_date, amount: -row.amount });
        break;
      case 'SWITCH_IN':
        agg.units += row.units;
        agg.invested += row.amount;
        break;
      case 'REDEMPTION':
        agg.units -= row.units;
        agg.invested -= row.amount;
        agg.cashFlows.push({ date: row.transaction_date, amount: row.amount });
        break;
      case 'SWITCH_OUT':
        agg.units -= row.units;
        agg.invested -= row.amount;
        break;
      case 'DIVIDEND':
        agg.cashFlows.push({ date: row.transaction_date, amount: row.amount });
        break;
    }
  }

  return groups;
}

/**
 * Resolve current value and XIRR for each aggregated holding via latest NAV.
 */
async function resolveCurrentValues(
  aggregates: HoldingAggregate[]
): Promise<Holding[]> {
  const today = new Date().toISOString().slice(0, 10);
  const navCache = new Map<string, number | null>();

  const holdings: Holding[] = [];

  for (const agg of aggregates) {
    if (agg.units <= 0.0001) continue; // fully redeemed

    let nav: number | null = null;
    if (agg.amfiCode) {
      if (navCache.has(agg.amfiCode)) {
        nav = navCache.get(agg.amfiCode)!;
      } else {
        try {
          nav = await getLatestNAV(agg.amfiCode);
        } catch {
          nav = null;
        }
        navCache.set(agg.amfiCode, nav);
      }
    }

    const currentValue =
      nav !== null ? agg.units * nav : Math.max(agg.invested, 0);
    const invested = Math.max(agg.invested, 0);
    const returnsAmount = currentValue - invested;
    const returnsPercent = invested > 0 ? (returnsAmount / invested) * 100 : 0;

    let xirr: number | null = null;
    if (nav !== null && currentValue > 0 && agg.cashFlows.length > 0) {
      const xirrFlows = [
        ...agg.cashFlows,
        { date: today, amount: currentValue },
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
  db: SQLiteDatabase,
  filters?: PortfolioFilters
): Promise<PortfolioSummary> {
  const groups = await aggregateHoldingsFromTransactions(db, {
    account: filters?.account,
  });
  const holdings = await resolveCurrentValues(Array.from(groups.values()));

  const totalInvested = holdings.reduce((s, h) => s + h.investedValue, 0);
  const totalCurrentValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const totalReturns = totalCurrentValue - totalInvested;
  const totalReturnsPercent =
    totalInvested > 0 ? (totalReturns / totalInvested) * 100 : 0;

  // Portfolio XIRR: union of all scheme cash flows + total current value today
  let xirr: number | null = null;
  if (holdings.length > 0 && totalCurrentValue > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const allFlows: Array<{ date: string; amount: number }> = [];
    for (const agg of groups.values()) {
      if (agg.units <= 0.0001) continue;
      for (const cf of agg.cashFlows) {
        allFlows.push(cf);
      }
    }
    allFlows.push({ date: today, amount: totalCurrentValue });
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
  db: SQLiteDatabase,
  filters?: HoldingsFilters
): Promise<Holding[]> {
  const groups = await aggregateHoldingsFromTransactions(db, {
    account: filters?.account,
  });
  let holdings = await resolveCurrentValues(Array.from(groups.values()));

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
  db: SQLiteDatabase,
  filters?: AssetAllocationFilters
): Promise<AssetAllocation[]> {
  const holdings = await getHoldings(db, { account: filters?.account });
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

export async function getAccounts(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ account_name: string }>(
    `
      SELECT DISTINCT account_name
      FROM investment_transactions
      ORDER BY account_name ASC
    `
  );
  return rows.map((row) => row.account_name);
}

// ──────────────────────────────────────────────────────────────
// Period-scoped queries (cohort view)
// ──────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getWindowStartDate(
  db: SQLiteDatabase,
  period: Period,
  today: Date,
  filters: { account?: string }
): Promise<string> {
  if (period !== 'ALL') {
    return formatDate(getPeriodStartDate(period, today));
  }
  const conditions: string[] = [];
  const params: string[] = [];
  if (filters.account) {
    conditions.push('account_name = ?');
    params.push(filters.account);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const row = await db.getFirstAsync<{ earliest: string | null }>(
    `SELECT MIN(transaction_date) as earliest FROM investment_transactions ${where}`,
    params
  );
  return row?.earliest ?? formatDate(today);
}

/**
 * Aggregate transactions within a window. Switches are included (they still
 * represent a scheme acquiring/losing units). Purchases/switch-ins count as
 * "invested in period", redemptions (pure REDEMPTION only) count as
 * "redeemed in period" for the holdings view. For the portfolio summary we
 * exclude switches from invested/redeemed totals (they're washes).
 */
type PeriodAggregate = HoldingAggregate & {
  purchasedInWindow: number; // PURCHASE + SWITCH_IN amounts
  redeemedInWindow: number; // REDEMPTION + SWITCH_OUT amounts (holdings view)
  purePurchased: number; // PURCHASE only (summary view)
  pureRedeemed: number; // REDEMPTION only (summary view)
  unitsInWindow: number; // net units added in window (purchases − redemptions)
  latestRedemptionDate: string | null;
};

async function aggregateTransactionsInWindow(
  db: SQLiteDatabase,
  window: { startDate: string; endDate: string },
  filters: { account?: string }
): Promise<Map<GroupKey, PeriodAggregate>> {
  const conditions: string[] = [
    't.scheme_id IS NOT NULL',
    't.transaction_date BETWEEN ? AND ?',
  ];
  const params: (string | number)[] = [window.startDate, window.endDate];

  if (filters.account) {
    conditions.push('t.account_name = ?');
    params.push(filters.account);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const rows = await db.getAllAsync<TransactionRow>(
    `
      SELECT
        t.scheme_id, t.scheme_name, t.account_name, t.investment_app,
        t.transaction_type, t.units, t.amount, t.transaction_date,
        s.amfi_code, s.amc_name, s.category, s.sub_category
      FROM investment_transactions t
      LEFT JOIN investment_schemes s ON t.scheme_id = s.id
      ${whereClause}
      ORDER BY t.transaction_date ASC
    `,
    params
  );

  const groups = new Map<GroupKey, PeriodAggregate>();

  for (const row of rows) {
    const key: GroupKey = `${row.scheme_id}::${row.account_name}::${row.investment_app}`;
    let agg = groups.get(key);
    if (!agg) {
      agg = {
        schemeId: row.scheme_id,
        schemeName: row.scheme_name,
        accountName: row.account_name,
        investmentApp: row.investment_app,
        amfiCode: row.amfi_code,
        amcName: row.amc_name,
        category: row.category,
        subCategory: row.sub_category,
        units: 0,
        invested: 0,
        latestDate: row.transaction_date,
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

    if (row.transaction_date > agg.latestDate) {
      agg.latestDate = row.transaction_date;
    }

    switch (row.transaction_type) {
      case 'PURCHASE':
        agg.purchasedInWindow += row.amount;
        agg.purePurchased += row.amount;
        agg.unitsInWindow += row.units;
        agg.cashFlows.push({ date: row.transaction_date, amount: -row.amount });
        break;
      case 'SWITCH_IN':
        agg.purchasedInWindow += row.amount;
        agg.unitsInWindow += row.units;
        agg.cashFlows.push({ date: row.transaction_date, amount: -row.amount });
        break;
      case 'REDEMPTION':
        agg.redeemedInWindow += row.amount;
        agg.pureRedeemed += row.amount;
        agg.unitsInWindow -= row.units;
        agg.cashFlows.push({ date: row.transaction_date, amount: row.amount });
        if (!agg.latestRedemptionDate || row.transaction_date > agg.latestRedemptionDate) {
          agg.latestRedemptionDate = row.transaction_date;
        }
        break;
      case 'SWITCH_OUT':
        agg.redeemedInWindow += row.amount;
        agg.unitsInWindow -= row.units;
        agg.cashFlows.push({ date: row.transaction_date, amount: row.amount });
        break;
      case 'DIVIDEND':
        agg.cashFlows.push({ date: row.transaction_date, amount: row.amount });
        break;
    }
  }

  return groups;
}

export async function getPortfolioSummaryForPeriod(
  db: SQLiteDatabase,
  params: { period: Period; account?: string }
): Promise<PortfolioSummary> {
  const today = new Date();
  const endDate = formatDate(today);
  const startDate = await getWindowStartDate(db, params.period, today, {
    account: params.account,
  });

  const groups = await aggregateTransactionsInWindow(
    db,
    { startDate, endDate },
    { account: params.account }
  );

  const navCache = new Map<string, number | null>();
  let totalInvested = 0;
  let totalRedeemed = 0;
  let totalCurrentValue = 0;
  let holdingsCount = 0;
  const allFlows: Array<{ date: string; amount: number }> = [];

  for (const agg of groups.values()) {
    totalInvested += agg.purePurchased; // exclude switches
    totalRedeemed += agg.pureRedeemed;

    let nav: number | null = null;
    if (agg.amfiCode) {
      if (navCache.has(agg.amfiCode)) {
        nav = navCache.get(agg.amfiCode)!;
      } else {
        try {
          nav = await getLatestNAV(agg.amfiCode);
        } catch {
          nav = null;
        }
        navCache.set(agg.amfiCode, nav);
      }
    }

    const unitsHeldFromWindow = Math.max(agg.unitsInWindow, 0);
    const currentValue =
      nav !== null && unitsHeldFromWindow > 0.0001
        ? unitsHeldFromWindow * nav
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
  db: SQLiteDatabase,
  params: { period: Period; account?: string; sortBy?: HoldingsFilters['sortBy']; sortOrder?: HoldingsFilters['sortOrder']; category?: HoldingsFilters['category']; amc?: HoldingsFilters['amc'] }
): Promise<Holding[]> {
  const today = new Date();
  const endDate = formatDate(today);
  const startDate = await getWindowStartDate(db, params.period, today, {
    account: params.account,
  });

  const groups = await aggregateTransactionsInWindow(
    db,
    { startDate, endDate },
    { account: params.account }
  );

  const navCache = new Map<string, number | null>();
  const holdings: Holding[] = [];

  for (const agg of groups.values()) {
    // Skip schemes that only had redemptions (they belong to redemption tiles)
    if (agg.unitsInWindow <= 0.0001) continue;
    if (agg.purchasedInWindow <= 0) continue;

    let nav: number | null = null;
    if (agg.amfiCode) {
      if (navCache.has(agg.amfiCode)) {
        nav = navCache.get(agg.amfiCode)!;
      } else {
        try {
          nav = await getLatestNAV(agg.amfiCode);
        } catch {
          nav = null;
        }
        navCache.set(agg.amfiCode, nav);
      }
    }

    // Holdings view includes switches in invested (correct scheme-level cost basis)
    const invested = agg.purchasedInWindow;
    const redeemed = agg.redeemedInWindow;
    const currentValue = nav !== null ? agg.unitsInWindow * nav : Math.max(invested - redeemed, 0);
    const returnsAmount = currentValue + redeemed - invested;
    const returnsPercent = invested > 0 ? (returnsAmount / invested) * 100 : 0;

    let xirr: number | null = null;
    if (nav !== null && currentValue > 0 && agg.cashFlows.length > 0) {
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
  db: SQLiteDatabase,
  params: { period: Period; account?: string }
): Promise<PeriodRedemption[]> {
  const today = new Date();
  const endDate = formatDate(today);
  const startDate = await getWindowStartDate(db, params.period, today, {
    account: params.account,
  });

  const groups = await aggregateTransactionsInWindow(
    db,
    { startDate, endDate },
    { account: params.account }
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
