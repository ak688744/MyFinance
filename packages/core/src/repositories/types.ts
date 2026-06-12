import type {
  InvestmentTransaction, Scheme, CashFlow, TransactionType, TransactionSummary,
  TransactionWithSchemeMeta,
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
  /**
   * DELETE FROM investment_transactions WHERE account_name = ? AND
   * investment_app = ? AND transaction_date BETWEEN ? AND ?. Returns deleted row
   * count. Used by importInvestmentTransactions for date-range replacement.
   */
  deleteByAccountAppDateRange(account: string, app: string, startDate: string, endDate: string): number;
  /**
   * Transactions joined with scheme metadata (LEFT JOIN investment_schemes),
   * filtered to rows with a non-null scheme_id, ordered by transaction_date ASC.
   * Optional date window (BETWEEN start AND end, inclusive). This is what the
   * original portfolioService read for holdings/period aggregation.
   */
  getTransactionsWithSchemeMeta(filters: {
    account?: string; startDate?: string; endDate?: string;
  }): TransactionWithSchemeMeta[];
  /** DISTINCT account_name FROM investment_transactions ORDER BY account_name ASC. */
  getAccounts(): string[];
  insert(tx: Omit<InvestmentTransaction, 'id'>): number;
}

export interface SchemeRepo {
  getSchemeById(id: number): Scheme | null;
  getSchemes(filters?: { category?: 'equity'|'debt'|'hybrid'|'other'; amc?: string; search?: string }): Scheme[];
  findSchemeByName(schemeName: string): Scheme | null;
  getSchemesWithAmfi(filters: { account?: string }): { schemeId: number; amfiCode: string }[];
  /**
   * Schemes with a NULL amfi_code, ordered by scheme_name ASC. Faithful port of
   * the `SELECT ... WHERE amfi_code IS NULL ORDER BY scheme_name` that the
   * original amfiMatcher.autoMatchAmfiCodes ran directly against the DB.
   */
  getUnmatchedSchemes(): Scheme[];
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
  /**
   * DELETE FROM investment_holdings WHERE account_name = ? AND
   * investment_app = ? AND as_of_date = ?. Returns deleted row count. Used by
   * importHoldings for same-date replacement.
   */
  deleteByAccountAppDate(account: string, app: string, asOfDate: string): number;
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
  updateRuleCategory(
    ruleId: number,
    categoryId: string,
    ruleType?: CategoryRuleType,
    priority?: number,
  ): void;
  deleteRule(ruleId: number): void;
}

export interface ExpenseTransactionRepo {
  list(filters?: { limit?: number; offset?: number; categoryId?: string }): unknown[];
  getNonManualForRecategorization(): { id: number; description: string; merchantKey: string | null; upiNoteKeyword: string | null }[];
  updateCategory(id: number, categoryId: string | null, categorySource: string | null): void;
  /**
   * INSERT OR IGNORE INTO transactions (...all columns incl. dedupe_key,
   * category_id, category_source). Returns the changed-row count (1 inserted,
   * 0 ignored on dedupe_key conflict). Faithful port of importTransactions'
   * INSERT OR IGNORE.
   */
  insertIgnore(tx: {
    transactionDate: string;
    valueDate: string | null;
    referenceNumber: string | null;
    description: string;
    normalizedDescription: string;
    merchantKey: string | null;
    upiNoteKeyword: string | null;
    amount: number;
    direction: 'debit' | 'credit';
    categoryId: string | null;
    categorySource: string | null;
    balance: number | null;
    sourceType: string;
    importHistoryId: number;
    dedupeKey: string;
  }): number;
}

export interface ImportHistoryRepo {
  create(r: { sourceName: string; sourceType: string; transactionCount: number }): number;
  createInvestmentImport(r: {
    accountName: string; investmentApp: string; importType: 'holdings'|'transactions';
    fileName?: string; startDate: string; endDate: string; recordCount?: number;
    totalInvested?: number; totalCurrentValue?: number; totalXirr?: number;
    holderName?: string; holderPan?: string;
  }): number;
  /**
   * SELECT id FROM investment_import_history WHERE account_name = ? AND
   * investment_app = ? AND import_type = ? AND start_date = ? AND end_date = ?.
   * Used by importHoldings to find prior same-date import rows for replacement.
   */
  findInvestmentImports(filters: {
    account: string; app: string; importType: 'holdings'|'transactions';
    startDate: string; endDate: string;
  }): { id: number }[];
  /** DELETE FROM investment_import_history WHERE id = ?. */
  deleteInvestmentImport(id: number): void;
}
