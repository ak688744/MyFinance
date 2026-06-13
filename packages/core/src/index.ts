export const CORE_VERSION = '0.0.0';

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
export { createDb, type Db } from './db/client';
export { runMigrations } from './db/migrate';
export { seedDatabase } from './db/seed';
export * as schema from './db/schema';
export { starterCategories, type StarterCategory } from './data/starterCategories';

// ---------------------------------------------------------------------------
// Repositories — factories + interface types
// ---------------------------------------------------------------------------
export { makeInvestmentTxRepo } from './repositories/investmentTxRepo';
export { makeSchemeRepo } from './repositories/schemeRepo';
export { makeHoldingsRepo } from './repositories/holdingsRepo';
export { makeCategoryRepo } from './repositories/categoryRepo';
export { makeCategoryRuleRepo } from './repositories/categoryRuleRepo';
export { makeExpenseTransactionRepo } from './repositories/expenseTransactionRepo';
export { makeImportHistoryRepo } from './repositories/importHistoryRepo';

export type {
  InvestmentTxRepo,
  SchemeRepo,
  HoldingsRepo,
  CategoryRepo,
  CategoryRuleType,
  StoredCategoryRule,
  CategoryRuleRepo,
  ExpenseTransactionRepo,
  ImportHistoryRepo,
  ImportRecord,
} from './repositories/types';

// ---------------------------------------------------------------------------
// Domain — xirr / returns / portfolio
// ---------------------------------------------------------------------------
export {
  calculateXIRR,
  parseDate,
  yearsBetween,
  formatDate,
} from './domain/xirr';

export {
  getPeriodReturns,
  getPeriodStartDate,
} from './domain/returns';

export {
  getPortfolioSummary,
  getHoldings,
  getAssetAllocation,
  getAccounts,
  getPortfolioSummaryForPeriod,
  getHoldingsForPeriod,
  getRedemptionsForPeriod,
} from './domain/portfolio';

// ---------------------------------------------------------------------------
// Domain — categorization
// ---------------------------------------------------------------------------
export {
  resolveCategoryFromRules,
  extractMerchantKey,
  extractUpiNoteKeyword,
  createCategorizationInput,
  recategorizeNonManualTransactions,
  createRule,
  updateRuleCategory,
  deleteRule,
  saveCategoryMemoryRule,
  slugifyCategoryName,
} from './domain/categorize';

export type {
  CategoryResolution,
  CategorizationInput,
  RecategorizeDeps,
} from './domain/categorize';

// ---------------------------------------------------------------------------
// Domain — NAV + AMFI
// ---------------------------------------------------------------------------
export {
  getLatestNAV,
  getNAVForDate,
  getNAVHistory,
  searchSchemes,
  getSchemeInfo,
  clearCache,
  type NAVData,
  type SchemeInfo,
} from './domain/nav/navService';

export {
  autoMatchAmfiCodes,
  verifySchemeNAV,
} from './domain/amfiMatcher';

// ---------------------------------------------------------------------------
// Import — parsers
// ---------------------------------------------------------------------------
export {
  parseHdfcStatementXls,
  type ParsedTransaction,
} from './import/hdfcParser';

export {
  parseGrowwTransactionXls,
  type ParsedMutualFundTransaction,
  type ParsedTransactionData,
} from './import/transactionParser';

export {
  parseGrowwHoldingsXls,
  type HoldingCategory,
  type ParsedHolding,
  type ParsedHoldingsData,
} from './import/holdingsParser';

// ---------------------------------------------------------------------------
// Import — orchestration
// ---------------------------------------------------------------------------
export {
  importTransactions,
  type ImportTransactionsResult,
  type ImportTransactionsDeps,
} from './import/importTransactions';

export {
  importHoldings,
  type ImportHoldingsResult,
  type ImportHoldingsDeps,
} from './import/importHoldings';

export {
  importInvestmentTransactions,
  // Renamed to avoid collision with importTransactions' ImportTransactionsResult.
  type ImportTransactionsResult as ImportInvestmentTransactionsResult,
  type ImportInvestmentTransactionsDeps,
} from './import/importInvestmentTransactions';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------
export type {
  TransactionType,
  InvestmentTransaction,
  TransactionSummary,
  Scheme,
  CashFlow,
  Period,
  PeriodReturns,
  PortfolioSummary,
  PeriodRedemption,
  Holding,
  AssetAllocation,
  TransactionWithSchemeMeta,
  NavLookup,
} from './types';
