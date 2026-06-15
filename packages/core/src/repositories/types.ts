import type {
  InvestmentTransaction, Scheme, CashFlow, TransactionType, TransactionSummary,
  TransactionWithSchemeMeta,
  Account, AccountDomain, Asset, AssetContribution, AssetRate, AssetValuation,
  Liability,
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
  create(c: { id: string; name: string; icon?: string | null }): void;
  rename(id: string, name: string): void;
  /**
   * Delete a category. Reassigns any transactions tagged with it to NULL
   * (Uncategorized) and deletes any category_rules targeting it, then removes
   * the category row — all in one transaction. Non-destructive to txn rows.
   */
  delete(id: string): void;
  exists(id: string): boolean;
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

export type ExpenseTransactionRow = {
  id: number;
  transactionDate: string;
  description: string;
  amount: number;
  direction: 'debit' | 'credit';
  categoryId: string | null;
  accountId: number | null;
  balance: number | null;
};

export interface ExpenseTransactionRepo {
  list(filters?: { limit?: number; offset?: number; categoryId?: string }): unknown[];
  getNonManualForRecategorization(): { id: number; description: string; merchantKey: string | null; upiNoteKeyword: string | null }[];
  updateCategory(id: number, categoryId: string | null, categorySource: string | null): void;
  getById(id: number): { id: number; description: string } | null;
  /**
   * Filterable expense-transaction query (richer than list). All filters
   * optional and AND-combined. direction filters on the credit/debit column.
   * search is a case-insensitive LIKE over description.
   */
  query(filters?: {
    from?: string;            // ISO date inclusive
    to?: string;              // ISO date inclusive
    direction?: 'in' | 'out'; // in => credit, out => debit
    search?: string;
    categoryId?: string;
    accountId?: number;
    limit?: number;
    offset?: number;
  }): ExpenseTransactionRow[];

  /**
   * Aggregated expense summary over the same filter window (no pagination).
   * totalSpent = sum(debit), totalIncome = sum(credit), saved = income - spent.
   * byCategory groups debit spend by category; byMonth groups debit spend by
   * YYYY-MM. Pure read aggregation — no financial-logic math.
   */
  summary(filters?: {
    from?: string;
    to?: string;
    accountId?: number;
  }): {
    totalSpent: number;
    totalIncome: number;
    saved: number;
    byCategory: { categoryId: string | null; amount: number }[];
    byMonth: { month: string; spent: number }[];
  };
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
    accountId: number | null;
  }): number;
  /** UPDATE transactions SET account_id = ? WHERE id = ?. */
  updateAccount(id: number, accountId: number | null): void;
}

export type ImportRecord = {
  kind: 'expense' | 'investment';
  id: number;
  /** expense: source_name; investment: file_name (may be null). */
  sourceName: string | null;
  /** investment only: 'holdings' | 'transactions'; null for expense. */
  importType: 'holdings' | 'transactions' | null;
  /** expense: transaction_count; investment: record_count (may be null). */
  recordCount: number | null;
  /** investment only; null for expense. */
  accountName: string | null;
  investmentApp: string | null;
  /** ISO timestamp (imported_at). */
  importedAt: string;
};

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
  /**
   * Unified, date-descending list of all import runs across both expense
   * (import_history) and investment (investment_import_history) tables.
   * Non-financial read used by the API's GET /imports.
   */
  listAll(): ImportRecord[];
}

// ── L1.5 unified investment model repos ────────────────────────

export interface AccountRepo {
  list(filters?: { domain?: AccountDomain }): Account[];
  getById(id: number): Account | null;
  create(a: { domain: AccountDomain; assetClass?: string | null; institution: string; label: string }): number;
  findByTriple(domain: AccountDomain, institution: string, label: string): Account | null;
  /** Find-or-create by (domain, institution, label); returns the account id. */
  ensureAccount(a: { domain: AccountDomain; assetClass?: string | null; institution: string; label: string }): number;
}

export interface AssetRepo {
  list(filters?: { account?: number; assetClass?: string; status?: 'active' | 'closed' }): Asset[];
  getById(id: number): Asset | null;
  create(a: {
    accountId: number; assetClass: Asset['assetClass']; name: string;
    valuationStrategy: 'computed' | 'manual'; ingestionMode?: Asset['ingestionMode'];
    params?: Asset['params']; status?: 'active' | 'closed'; openedAt?: string | null;
  }): number;
  update(id: number, patch: Partial<{
    name: string; status: 'active' | 'closed'; params: Asset['params']; openedAt: string | null;
  }>): void;
  delete(id: number): void;
}

export interface AssetContributionRepo {
  listByAsset(assetId: number): AssetContribution[];
  insert(c: { assetId: number; contributionDate: string; amount: number; note?: string | null }): number;
}

export interface AssetRateRepo {
  listByAsset(assetId: number): AssetRate[];
  insert(r: { assetId: number; effectiveFrom: string; rate: number }): number;
}

export interface AssetValuationRepo {
  listByAsset(assetId: number): AssetValuation[];
  insert(v: { assetId: number; value: number; valuedAt: string; note?: string | null }): number;
}

export interface LiabilityRepo {
  list(filters?: { status?: 'active' | 'closed' }): Liability[];
  getById(id: number): Liability | null;
  create(l: {
    accountId?: number | null; name: string; loanType: Liability['loanType'];
    principal: number; annualRate: number; tenureMonths?: number | null;
    emiAmount?: number | null; startDate: string; status?: 'active' | 'closed';
  }): number;
  update(id: number, patch: Partial<{
    name: string; loanType: Liability['loanType']; principal: number; annualRate: number;
    tenureMonths: number | null; emiAmount: number | null; startDate: string; status: 'active' | 'closed';
  }>): void;
  delete(id: number): void;
}
