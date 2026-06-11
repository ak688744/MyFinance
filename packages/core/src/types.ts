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
