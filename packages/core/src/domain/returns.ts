import { calculateXIRR, formatDate, parseDate } from './xirr';
import type {
  HoldingsRepo,
  InvestmentTxRepo,
  SchemeRepo,
} from '../repositories/types';
import type { NavLookup, Period, PeriodReturns } from '../types';

/**
 * Period-returns math, ported verbatim from
 * src/features/investment/returnsCalculator.ts.
 *
 * The ONLY structural change vs. the RN original: instead of taking a
 * SQLiteDatabase and running inline SQL, each function takes injected repos
 * (synchronous, better-sqlite3-backed) plus an injected NavLookup (async,
 * network-backed). Functions that touch NAV stay async and await the injected
 * NAV fns; repo calls are plain synchronous calls. ALL arithmetic/branching is
 * reproduced exactly — this is Groww-validated core logic.
 *
 * formatDate / parseDate / calculateXIRR are reused from ./xirr (not redefined).
 */

type ReturnsDeps = {
  txRepo: InvestmentTxRepo;
  schemeRepo: SchemeRepo;
  holdingsRepo: HoldingsRepo;
  nav: NavLookup;
};

type PeriodParams = {
  period: Period;
  account?: string;
  schemeId?: number;
  /** Injectable for deterministic tests; defaults to new Date(). */
  today?: Date;
};

/**
 * Calculate start date for a given period. (Verbatim port.)
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
 * Calculate units held from transactions up to a specific date.
 * Original read transactions via getTransactions(db, {...endDate}); now uses
 * the injected txRepo (synchronous). Pure arithmetic, no NAV -> synchronous.
 */
export function calculateUnitsAtDate(
  txRepo: InvestmentTxRepo,
  endDate: string,
  filters: { account?: string; schemeId?: number },
): { units: number; investedValue: number } {
  const transactions = txRepo.getTransactions({
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
 * Calculate portfolio value at a specific date using NAV data.
 * Returns null if NAV data is not available for enough schemes.
 * Touches NAV -> async. Inline SQL helpers replaced with repo methods:
 *   getSchemesWithAmfi -> schemeRepo.getSchemesWithAmfi
 *   calculateUnitsPerScheme -> txRepo.getUnitsPerSchemeUpTo
 */
export async function calculatePortfolioValueAtDate(
  deps: { schemeRepo: SchemeRepo; txRepo: InvestmentTxRepo; nav: NavLookup },
  date: string,
  filters: { account?: string },
): Promise<number | null> {
  const schemes = deps.schemeRepo.getSchemesWithAmfi(filters);
  if (schemes.length === 0) {
    return null;
  }

  const unitsMap = deps.txRepo.getUnitsPerSchemeUpTo(date, filters);
  if (unitsMap.size === 0) {
    return 0;
  }

  let totalValue = 0;
  let schemesWithNav = 0;

  for (const scheme of schemes) {
    const units = unitsMap.get(scheme.schemeId) || 0;
    if (units <= 0) continue;

    try {
      const navData = await deps.nav.getNAVForDate(scheme.amfiCode, date);
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
 * Calculate returns for a specific period. (Verbatim port of getPeriodReturns.)
 * Touches NAV -> async. Inline SQL helpers replaced:
 *   getEarliestTransactionDate -> txRepo.getEarliestTransactionDate
 *   getSchemeById              -> schemeRepo.getSchemeById
 *   getHoldingsValue           -> holdingsRepo.getHoldingsValue
 *   getCashFlows               -> txRepo.getCashFlows
 */
export async function getPeriodReturns(
  deps: ReturnsDeps,
  params: PeriodParams,
): Promise<PeriodReturns> {
  const { txRepo, schemeRepo, holdingsRepo, nav } = deps;
  const { period, account, schemeId } = params;
  const today = params.today ?? new Date();
  const endDate = formatDate(today);

  // Calculate period start date
  let startDate: string;
  if (period === 'ALL') {
    const earliest = txRepo.getEarliestTransactionDate({ account, schemeId });
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

  const startPosition = calculateUnitsAtDate(txRepo, dayBeforeStart, {
    account,
    schemeId,
  });

  // Get current position
  const endPosition = calculateUnitsAtDate(txRepo, endDate, { account, schemeId });

  // Calculate net investment in period
  const investedInPeriod =
    endPosition.investedValue - startPosition.investedValue;

  // Try to get NAV-based values
  let startValue = startPosition.investedValue;
  let endValue = endPosition.investedValue;
  let useNAV = false;

  if (schemeId !== undefined) {
    // Single scheme: fetch NAV directly
    const scheme = schemeRepo.getSchemeById(schemeId);
    if (scheme?.amfiCode) {
      try {
        // Get NAV for start date
        const startNAV = await nav.getNAVForDate(scheme.amfiCode, startDate);
        // Get latest NAV for end value
        const latestNAV = await nav.getLatestNAV(scheme.amfiCode);

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
      const portfolioStartValue = await calculatePortfolioValueAtDate(
        { schemeRepo, txRepo, nav },
        startDate,
        { account },
      );
      const portfolioEndValue = await calculatePortfolioValueAtDate(
        { schemeRepo, txRepo, nav },
        endDate,
        { account },
      );

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
    const holdingsValue = holdingsRepo.getHoldingsValue({ account, schemeId });
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
  const cashFlows = txRepo.getCashFlows({
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
