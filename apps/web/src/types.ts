export type {
  NetWorthSummary, NetWorthPoint, PortfolioSummary, PeriodReturns,
  Holding, AssetAllocation, ValuedAsset, Liability, AmortizationRow, LoanStatus,
  Account, AssetClass, ValuationStrategy, Period,
} from '@myfinance/core';

export type ExpenseRow = {
  id: number; transactionDate: string; description: string;
  amount: number; direction: 'debit' | 'credit';
  categoryId: string | null; categorySource: string | null; aiKeyword: string | null;
  note: string | null; accountId: number | null; balance: number | null;
  tags: { tag: string; source: 'user' | 'agent' }[];
  parentTransactionId: number | null;
};

export type SplitChild = ExpenseRow;
export type SplitResult = {
  parentId: number;
  parentAmount: number;
  detectedTotal: number | null;
  parsedTotal: number;
  matched: boolean;
  reconciledAgainst: 'statementTotal' | 'billAmount';
  carryover: number;
  children: SplitChild[];
};

export type ExpenseSummary = {
  totalSpent: number; totalIncome: number; saved: number; invested: number;
  byCategory: { categoryId: string | null; amount: number }[];
  byMonth: { month: string; spent: number }[];
};

export type Category = { id: string; name: string; icon: string | null };

export type CategoryRule = {
  id: number;
  ruleType: 'merchant' | 'upi_note_keyword' | 'keyword';
  patternValue: string;
  categoryId: string;
  priority: number;
};

/** A liability row from GET /liabilities, enriched with computed EMI + status summary. */
export type LiabilityListItem = import('@myfinance/core').Liability & {
  emi: number | null;
  outstanding: number;
  paidPrincipal: number;
  progressPercent: number;
  monthsRemaining: number;
  nextDueDate: string | null;
};

export type LiabilityDetail = {
  liability: import('@myfinance/core').Liability;
  status: import('@myfinance/core').LoanStatus;
  schedule: import('@myfinance/core').AmortizationRow[];
};

// A triaged insight card (server: rule candidates → consolidation → LLM triage).
export type InsightOption = {
  label: string;
  tags: string[];
  categoryFix: string | null;
};

export type Insight = {
  eventId: string;
  signature: string;
  tier: 'needs_input' | 'worth_knowing';
  keep: boolean;
  lane: 'needs_input' | 'worth_knowing' | null;
  refinedTitle: string;
  refinedDetail: string;
  question: string | null;
  options: InsightOption[];
  reason: string;
  txnIds: number[];
};
