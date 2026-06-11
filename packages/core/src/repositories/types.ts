import type {
  InvestmentTransaction, Scheme, CashFlow, TransactionType, TransactionSummary,
} from '../types';

export interface InvestmentTxRepo {
  getTransactions(filters?: {
    account?: string; schemeId?: number; schemeName?: string;
    type?: TransactionType; startDate?: string; endDate?: string; limit?: number;
  }): InvestmentTransaction[];
  getTransactionsByScheme(schemeId: number): InvestmentTransaction[];
  getCashFlows(filters?: {
    account?: string; schemeId?: number; startDate?: string; endDate?: string;
  }): CashFlow[];
  getTransactionSummary(filters?: {
    account?: string; startDate?: string; endDate?: string;
  }): TransactionSummary;
  getEarliestTransactionDate(filters: { account?: string; schemeId?: number }): string | null;
  getUnitsPerSchemeUpTo(endDate: string, filters: { account?: string }): Map<number, number>;
  insert(tx: Omit<InvestmentTransaction, 'id'>): number;
}

export interface SchemeRepo {
  getSchemeById(id: number): Scheme | null;
  getSchemes(filters?: { category?: 'equity'|'debt'|'hybrid'|'other'; amc?: string; search?: string }): Scheme[];
  findSchemeByName(schemeName: string): Scheme | null;
  getSchemesWithAmfi(filters: { account?: string }): { schemeId: number; amfiCode: string }[];
  updateAmfiCode(schemeId: number, amfiCode: string): void;
  matchOrCreateScheme(p: { schemeName: string; amcName?: string;
    category?: 'equity'|'debt'|'hybrid'|'other'; subCategory?: string }): number;
}

export interface HoldingsRepo {
  getHoldingsValue(filters: { account?: string; schemeId?: number }):
    { currentValue: number; investedValue: number };
  insert(h: {
    importHistoryId: number; schemeId: number | null; accountName: string;
    investmentApp: string; schemeName: string; folioNumber: string | null;
    units: number; investedValue: number; currentValue: number;
    returnsAmount: number; returnsXirr: number | null; asOfDate: string;
  }): number;
}

export interface CategoryRepo {
  list(): { id: string; name: string; icon: string | null }[];
  upsertStarter(c: { id: string; name: string; icon: string | null }): void;
}

export type CategoryRuleType = 'merchant' | 'upi_note_keyword';
export interface StoredCategoryRule {
  id: number;
  ruleType: CategoryRuleType;
  patternValue: string;
  categoryId: string;
  priority: number;
}
export interface CategoryRuleRepo {
  getActiveRules(): StoredCategoryRule[];
  createRule(r: { ruleType: CategoryRuleType; patternValue: string; categoryId: string; priority?: number; createdFromTransactionId?: number }): number;
  updateRuleCategory(ruleId: number, categoryId: string): void;
  deleteRule(ruleId: number): void;
}

export interface ExpenseTransactionRepo {
  list(filters?: { limit?: number; offset?: number; categoryId?: string }): unknown[];
  getNonManualForRecategorization(): { id: number; description: string; merchantKey: string | null; upiNoteKeyword: string | null }[];
  updateCategory(id: number, categoryId: string | null, categorySource: string | null): void;
}

export interface ImportHistoryRepo {
  create(r: { sourceName: string; sourceType: string; transactionCount: number }): number;
  createInvestmentImport(r: {
    accountName: string; investmentApp: string; importType: 'holdings'|'transactions';
    fileName?: string; startDate: string; endDate: string; recordCount?: number;
    totalInvested?: number; totalCurrentValue?: number; totalXirr?: number;
    holderName?: string; holderPan?: string;
  }): number;
}
