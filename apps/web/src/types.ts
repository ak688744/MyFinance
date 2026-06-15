export type {
  NetWorthSummary, NetWorthPoint, PortfolioSummary, PeriodReturns,
  Holding, AssetAllocation, ValuedAsset, Liability, AmortizationRow, LoanStatus,
  Account, AssetClass, ValuationStrategy, Period,
} from '@myfinance/core';

export type ExpenseRow = {
  id: number; transactionDate: string; description: string;
  amount: number; direction: 'debit' | 'credit';
  categoryId: string | null; accountId: number | null; balance: number | null;
};

export type ExpenseSummary = {
  totalSpent: number; totalIncome: number; saved: number;
  byCategory: { categoryId: string | null; amount: number }[];
  byMonth: { month: string; spent: number }[];
};

export type Category = { id: string; name: string; icon: string | null };

export type CategoryRule = {
  id: number;
  ruleType: 'merchant' | 'upi_note_keyword';
  patternValue: string;
  categoryId: string;
  priority: number;
};

export type LiabilityDetail = {
  liability: import('@myfinance/core').Liability;
  status: import('@myfinance/core').LoanStatus;
  schedule: import('@myfinance/core').AmortizationRow[];
};
