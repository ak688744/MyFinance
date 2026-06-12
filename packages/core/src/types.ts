export type TransactionType =
  | 'PURCHASE' | 'REDEMPTION' | 'SWITCH_IN' | 'SWITCH_OUT' | 'DIVIDEND';

export type InvestmentTransaction = {
  id: number;
  schemeId: number | null;
  schemeName: string;
  accountName: string;
  investmentApp: string;
  transactionType: TransactionType;
  units: number;
  nav: number;
  amount: number;
  transactionDate: string;
};

export type TransactionSummary = {
  totalPurchases: number;
  totalRedemptions: number;
  netInvestment: number;
  transactionCount: number;
};

export type Scheme = {
  id: number;
  schemeName: string;
  amfiCode: string | null;
  isin: string | null;
  amcName: string | null;
  category: 'equity' | 'debt' | 'hybrid' | 'other' | null;
  subCategory: string | null;
};

export type CashFlow = { date: string; amount: number };

export type Period = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL';

export type PeriodReturns = {
  period: Period;
  startDate: string;
  endDate: string;
  startValue: number;
  endValue: number;
  investedInPeriod: number;
  returns: number;
  returnsPercent: number;
  xirr: number | null;
};

// ──────────────────────────────────────────────────────────────
// Portfolio aggregation types (ported verbatim from
// src/features/investment/services/portfolioService.ts)
// ──────────────────────────────────────────────────────────────

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

/**
 * A transaction row joined with its scheme metadata, ordered by
 * transaction_date ASC. This is the shape the original portfolioService
 * read via a LEFT JOIN of investment_transactions onto investment_schemes.
 * The repo owns that join; the domain layer consumes this flat row.
 */
export type TransactionWithSchemeMeta = {
  schemeId: number;
  schemeName: string;
  accountName: string;
  investmentApp: string;
  transactionType: TransactionType;
  units: number;
  amount: number;
  transactionDate: string;
  amfiCode: string | null;
  amcName: string | null;
  category: 'equity' | 'debt' | 'hybrid' | 'other' | null;
  subCategory: string | null;
};

/**
 * Injected NAV lookup functions (the network layer, built in Task 3.4).
 * Signatures mirror src/features/investment/navService.ts:
 *   getNAVForDate -> NAVData | null where NAVData = { date, nav }
 *   getLatestNAV  -> number | null
 */
export type NavLookup = {
  getNAVForDate(amfiCode: string, date: string): Promise<{ date: string; nav: number } | null>;
  getLatestNAV(amfiCode: string): Promise<number | null>;
};
