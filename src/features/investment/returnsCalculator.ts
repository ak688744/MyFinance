import type { SQLiteDatabase } from 'expo-sqlite';
import { getTransactions, getCashFlows } from './services/transactionService';
import { getNAVForDate, getLatestNAV } from './navService';
import { getSchemeById } from './services/schemeService';

// Types
export type Period = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL';

export type PeriodReturns = {
  period: Period;
  startDate: string;
  endDate: string;
  startValue: number;
  endValue: number;
  investedInPeriod: number; // Net investment during period
  returns: number; // endValue - startValue - investedInPeriod
  returnsPercent: number;
  xirr: number | null;
};

type PeriodParams = {
  period: Period;
  account?: string;
  schemeId?: number;
};

/**
 * Format a Date object to YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string to Date object
 */
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Calculate start date for a given period
 */
export function getPeriodStartDate(period: Period, today: Date): Date {
  const result = new Date(today);

  switch (period) {
    case '1M':
      result.setMonth(result.getMonth() - 1);
      break;
    case '3M':
      result.setMonth(result.getMonth() - 3);
      break;
    case '6M':
      result.setMonth(result.getMonth() - 6);
      break;
    case '1Y':
      result.setFullYear(result.getFullYear() - 1);
      break;
    case '3Y':
      result.setFullYear(result.getFullYear() - 3);
      break;
    case '5Y':
      result.setFullYear(result.getFullYear() - 5);
      break;
    case 'ALL':
      // For ALL, return a very old date; actual start will be determined by earliest transaction
      result.setFullYear(1900, 0, 1);
      break;
  }

  return result;
}

/**
 * Calculate the difference in years between two dates (for XIRR calculation)
 */
function yearsBetween(date1: Date, date2: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = (date2.getTime() - date1.getTime()) / msPerDay;
  return days / 365;
}

/**
 * Calculate XIRR from cash flows using Newton-Raphson method
 * Cash flows: negative = investment (money out), positive = redemption (money in)
 * Final value should be added as positive cash flow on end date
 *
 * XIRR solves for rate where NPV = 0
 * NPV = sum of (cashFlow / (1 + rate)^years)
 */
export function calculateXIRR(
  cashFlows: Array<{ date: string; amount: number }>
): number | null {
  if (cashFlows.length < 2) {
    return null;
  }

  // Need at least one positive and one negative cash flow
  const hasPositive = cashFlows.some((cf) => cf.amount > 0);
  const hasNegative = cashFlows.some((cf) => cf.amount < 0);
  if (!hasPositive || !hasNegative) {
    return null;
  }

  // Parse dates and convert to years from first date
  const firstDate = parseDate(cashFlows[0].date);
  const flows = cashFlows.map((cf) => ({
    amount: cf.amount,
    years: yearsBetween(firstDate, parseDate(cf.date)),
  }));

  // NPV function: sum of cashFlow / (1 + rate)^years
  const npv = (rate: number): number => {
    return flows.reduce((sum, flow) => {
      const discountFactor = Math.pow(1 + rate, flow.years);
      return sum + flow.amount / discountFactor;
    }, 0);
  };

  // Derivative of NPV function
  const npvDerivative = (rate: number): number => {
    return flows.reduce((sum, flow) => {
      if (flow.years === 0) return sum;
      const discountFactor = Math.pow(1 + rate, flow.years);
      return sum - (flow.years * flow.amount) / ((1 + rate) * discountFactor);
    }, 0);
  };

  // Newton-Raphson iteration
  const maxIterations = 100;
  const tolerance = 1e-7;
  let rate = 0.1; // Initial guess: 10%

  for (let i = 0; i < maxIterations; i++) {
    const npvValue = npv(rate);
    const npvDeriv = npvDerivative(rate);

    // Check for convergence on NPV
    if (Math.abs(npvValue) < tolerance) {
      return rate;
    }

    // Check for division by zero or very small derivative
    if (Math.abs(npvDeriv) < 1e-10) {
      rate = rate > 0 ? rate * 0.5 : rate * 2;
      continue;
    }

    // Newton-Raphson step
    const newRate = rate - npvValue / npvDeriv;

    // Clamp to valid range
    const clampedRate = Math.max(-0.99, Math.min(10, newRate));

    // Check for convergence based on rate change
    if (Math.abs(clampedRate - rate) < tolerance) {
      return clampedRate;
    }

    rate = clampedRate;
  }

  // If Newton-Raphson didn't converge, try bisection method
  return bisectionXIRR(flows);
}

/**
 * Fallback bisection method for XIRR when Newton-Raphson fails
 */
function bisectionXIRR(
  flows: Array<{ amount: number; years: number }>
): number | null {
  const npv = (rate: number): number => {
    return flows.reduce((sum, flow) => {
      const discountFactor = Math.pow(1 + rate, flow.years);
      return sum + flow.amount / discountFactor;
    }, 0);
  };

  let low = -0.99;
  let high = 10;
  const maxIterations = 100;
  const tolerance = 1e-7;

  // Check if solution exists in range
  const npvLow = npv(low);
  const npvHigh = npv(high);

  if (npvLow * npvHigh > 0) {
    // No sign change, no solution in range
    return null;
  }

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    const npvMid = npv(mid);

    if (Math.abs(npvMid) < tolerance || (high - low) / 2 < tolerance) {
      return mid;
    }

    if (npvMid * npvLow < 0) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return null;
}

/**
 * Calculate units held from transactions up to a specific date
 */
async function calculateUnitsAtDate(
  db: SQLiteDatabase,
  endDate: string,
  filters: { account?: string; schemeId?: number }
): Promise<{ units: number; investedValue: number }> {
  const transactions = await getTransactions(db, {
    account: filters.account,
    schemeId: filters.schemeId,
    endDate,
  });

  let totalUnits = 0;
  let totalInvested = 0;

  for (const tx of transactions) {
    switch (tx.transactionType) {
      case 'PURCHASE':
      case 'SWITCH_IN':
        totalUnits += tx.units;
        totalInvested += tx.amount;
        break;
      case 'REDEMPTION':
      case 'SWITCH_OUT':
        totalUnits -= tx.units;
        totalInvested -= tx.amount;
        break;
      case 'DIVIDEND':
        // Dividends don't affect units or invested value (unless reinvested, which would be a separate PURCHASE)
        break;
    }
  }

  return {
    units: Math.max(0, totalUnits),
    investedValue: Math.max(0, totalInvested),
  };
}

/**
 * Get earliest transaction date
 */
async function getEarliestTransactionDate(
  db: SQLiteDatabase,
  filters: { account?: string; schemeId?: number }
): Promise<string | null> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.account) {
    conditions.push('account_name = ?');
    params.push(filters.account);
  }

  if (filters.schemeId !== undefined) {
    conditions.push('scheme_id = ?');
    params.push(filters.schemeId);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.getFirstAsync<{ earliest: string | null }>(
    `
      SELECT MIN(transaction_date) as earliest
      FROM investment_transactions
      ${whereClause}
    `,
    params
  );

  return result?.earliest ?? null;
}

/**
 * Get current value from holdings (fallback when NAV not available)
 */
async function getHoldingsValue(
  db: SQLiteDatabase,
  filters: { account?: string; schemeId?: number }
): Promise<{ currentValue: number; investedValue: number }> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.account) {
    conditions.push('account_name = ?');
    params.push(filters.account);
  }

  if (filters.schemeId !== undefined) {
    conditions.push('scheme_id = ?');
    params.push(filters.schemeId);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await db.getFirstAsync<{
    current_value: number | null;
    invested_value: number | null;
  }>(
    `
      SELECT
        COALESCE(SUM(current_value), 0) as current_value,
        COALESCE(SUM(invested_value), 0) as invested_value
      FROM investment_holdings
      ${whereClause}
    `,
    params
  );

  return {
    currentValue: result?.current_value ?? 0,
    investedValue: result?.invested_value ?? 0,
  };
}

/**
 * Get all unique schemes with their AMFI codes for portfolio-level NAV lookup
 */
async function getSchemesWithAmfi(
  db: SQLiteDatabase,
  filters: { account?: string }
): Promise<Array<{ schemeId: number; amfiCode: string }>> {
  const conditions: string[] = ['s.amfi_code IS NOT NULL'];
  const params: (string | number)[] = [];

  if (filters.account) {
    conditions.push('h.account_name = ?');
    params.push(filters.account);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const rows = await db.getAllAsync<{
    scheme_id: number;
    amfi_code: string;
  }>(
    `
      SELECT DISTINCT h.scheme_id, s.amfi_code
      FROM investment_holdings h
      JOIN investment_schemes s ON h.scheme_id = s.id
      ${whereClause}
    `,
    params
  );

  return rows.map((r) => ({ schemeId: r.scheme_id, amfiCode: r.amfi_code }));
}

/**
 * Calculate units per scheme at a specific date from transactions
 */
async function calculateUnitsPerScheme(
  db: SQLiteDatabase,
  endDate: string,
  filters: { account?: string }
): Promise<Map<number, number>> {
  const conditions: string[] = ['scheme_id IS NOT NULL', 'transaction_date <= ?'];
  const params: (string | number)[] = [endDate];

  if (filters.account) {
    conditions.push('account_name = ?');
    params.push(filters.account);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const rows = await db.getAllAsync<{
    scheme_id: number;
    transaction_type: string;
    units: number;
  }>(
    `
      SELECT scheme_id, transaction_type, units
      FROM investment_transactions
      ${whereClause}
    `,
    params
  );

  const unitsMap = new Map<number, number>();

  for (const row of rows) {
    const current = unitsMap.get(row.scheme_id) || 0;
    switch (row.transaction_type) {
      case 'PURCHASE':
      case 'SWITCH_IN':
        unitsMap.set(row.scheme_id, current + row.units);
        break;
      case 'REDEMPTION':
      case 'SWITCH_OUT':
        unitsMap.set(row.scheme_id, Math.max(0, current - row.units));
        break;
    }
  }

  return unitsMap;
}

/**
 * Calculate portfolio value at a specific date using NAV data
 * Returns null if NAV data is not available for enough schemes
 */
async function calculatePortfolioValueAtDate(
  db: SQLiteDatabase,
  date: string,
  filters: { account?: string }
): Promise<number | null> {
  const schemes = await getSchemesWithAmfi(db, filters);
  if (schemes.length === 0) {
    return null;
  }

  const unitsMap = await calculateUnitsPerScheme(db, date, filters);
  if (unitsMap.size === 0) {
    return 0;
  }

  let totalValue = 0;
  let schemesWithNav = 0;

  for (const scheme of schemes) {
    const units = unitsMap.get(scheme.schemeId) || 0;
    if (units <= 0) continue;

    try {
      const navData = await getNAVForDate(scheme.amfiCode, date);
      if (navData) {
        totalValue += units * navData.nav;
        schemesWithNav++;
      }
    } catch (error) {
      console.warn(`Failed to fetch NAV for scheme ${scheme.schemeId}:`, error);
    }
  }

  if (schemesWithNav === 0 && unitsMap.size > 0) {
    return null;
  }

  return totalValue;
}

/**
 * Calculate returns for a specific period
 */
export async function getPeriodReturns(
  db: SQLiteDatabase,
  params: PeriodParams
): Promise<PeriodReturns> {
  const { period, account, schemeId } = params;
  const today = new Date();
  const endDate = formatDate(today);

  // Calculate period start date
  let startDate: string;
  if (period === 'ALL') {
    const earliest = await getEarliestTransactionDate(db, { account, schemeId });
    if (!earliest) {
      // No transactions found
      return {
        period,
        startDate: endDate,
        endDate,
        startValue: 0,
        endValue: 0,
        investedInPeriod: 0,
        returns: 0,
        returnsPercent: 0,
        xirr: null,
      };
    }
    startDate = earliest;
  } else {
    startDate = formatDate(getPeriodStartDate(period, today));
  }

  // Get units and invested value at period start (all transactions before start date)
  const startDateObj = parseDate(startDate);
  startDateObj.setDate(startDateObj.getDate() - 1);
  const dayBeforeStart = formatDate(startDateObj);

  const startPosition = await calculateUnitsAtDate(db, dayBeforeStart, {
    account,
    schemeId,
  });

  // Get current position
  const endPosition = await calculateUnitsAtDate(db, endDate, { account, schemeId });

  // Calculate net investment in period
  const investedInPeriod =
    endPosition.investedValue - startPosition.investedValue;

  // Try to get NAV-based values
  let startValue = startPosition.investedValue;
  let endValue = endPosition.investedValue;
  let useNAV = false;

  if (schemeId !== undefined) {
    // Single scheme: fetch NAV directly
    const scheme = await getSchemeById(db, schemeId);
    if (scheme?.amfiCode) {
      try {
        // Get NAV for start date
        const startNAV = await getNAVForDate(scheme.amfiCode, startDate);
        // Get latest NAV for end value
        const latestNAV = await getLatestNAV(scheme.amfiCode);

        if (startNAV && latestNAV) {
          startValue = startPosition.units * startNAV.nav;
          endValue = endPosition.units * latestNAV;
          useNAV = true;
        }
      } catch (error) {
        // NAV fetch failed, fall back to holdings-based values
        console.warn('Failed to fetch NAV for single scheme, using holdings-based values');
      }
    }
  } else {
    try {
      const portfolioStartValue = await calculatePortfolioValueAtDate(db, startDate, { account });
      const portfolioEndValue = await calculatePortfolioValueAtDate(db, endDate, { account });

      if (portfolioStartValue !== null && portfolioEndValue !== null) {
        startValue = portfolioStartValue;
        endValue = portfolioEndValue;
        useNAV = true;
      }
    } catch (error) {
      console.warn('Failed to calculate portfolio NAV values:', error);
    }
  }

  if (!useNAV) {
    const holdingsValue = await getHoldingsValue(db, { account, schemeId });
    if (holdingsValue.currentValue > 0) {
      endValue = holdingsValue.currentValue;
      if (endPosition.investedValue > 0) {
        const growthRatio = holdingsValue.currentValue / endPosition.investedValue;
        startValue = startPosition.investedValue * growthRatio;
      }
    }
  }

  // Calculate returns
  const returns = endValue - startValue - investedInPeriod;
  const baseValue = startValue + investedInPeriod;
  const returnsPercent = baseValue > 0 ? (returns / baseValue) * 100 : 0;

  // Calculate XIRR
  const cashFlows = await getCashFlows(db, {
    account,
    schemeId,
    startDate,
    endDate,
  });

  // Add final value as positive cash flow (current value is money you could get back)
  const xirrCashFlows = [
    ...cashFlows,
    { date: endDate, amount: endValue },
  ];

  // Also need to account for starting value as an investment at period start
  if (startValue > 0) {
    xirrCashFlows.unshift({ date: startDate, amount: -startValue });
  }

  // Sort cash flows by date
  xirrCashFlows.sort((a, b) => a.date.localeCompare(b.date));

  const xirr = calculateXIRR(xirrCashFlows);

  return {
    period,
    startDate,
    endDate,
    startValue,
    endValue,
    investedInPeriod,
    returns,
    returnsPercent,
    xirr,
  };
}
