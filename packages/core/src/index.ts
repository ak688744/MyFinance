export const CORE_VERSION = '0.0.0';

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
export { createDb, type Db } from './db/client.js';
export { runMigrations } from './db/migrate.js';
export { seedDatabase } from './db/seed.js';
export * as schema from './db/schema.js';
export { starterCategories, type StarterCategory } from './data/starterCategories.js';
export { encryptSecret, decryptSecret } from './db/crypto.js';

// ---------------------------------------------------------------------------
// Repositories — factories + interface types
// ---------------------------------------------------------------------------
export { makeInvestmentTxRepo } from './repositories/investmentTxRepo.js';
export { makeSchemeRepo } from './repositories/schemeRepo.js';
export { makeHoldingsRepo } from './repositories/holdingsRepo.js';
export { makeCategoryRepo } from './repositories/categoryRepo.js';
export { makeCategoryRuleRepo } from './repositories/categoryRuleRepo.js';
export { makeExpenseTransactionRepo } from './repositories/expenseTransactionRepo.js';
export { makeImportHistoryRepo } from './repositories/importHistoryRepo.js';
export { makeAccountRepo } from './repositories/accountRepo.js';
export { makeAssetRepo } from './repositories/assetRepo.js';
export { makeAssetContributionRepo } from './repositories/assetContributionRepo.js';
export { makeAssetRateRepo } from './repositories/assetRateRepo.js';
export { makeAssetValuationRepo } from './repositories/assetValuationRepo.js';
export { makeLiabilityRepo } from './repositories/liabilityRepo.js';
export { makeAiProviderRepo } from './repositories/aiProviderRepo.js';
export { makeAiModelRepo } from './repositories/aiModelRepo.js';
export { makeAiTaskRouteRepo } from './repositories/aiTaskRouteRepo.js';
export { makeAiUsageRepo } from './repositories/aiUsageRepo.js';

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
  AccountRepo,
  AssetRepo,
  AssetContributionRepo,
  AssetRateRepo,
  AssetValuationRepo,
  LiabilityRepo,
  AiDialect,
  AiProviderRow,
  AiModelRow,
  AiTaskRouteRow,
  AiUsageEventRow,
  AiProviderRepo,
  AiModelRepo,
  AiTaskRouteRepo,
  AiUsageRepo,
} from './repositories/types.js';

// ---------------------------------------------------------------------------
// Domain — xirr / returns / portfolio
// ---------------------------------------------------------------------------
export {
  calculateXIRR,
  parseDate,
  yearsBetween,
  formatDate,
} from './domain/xirr.js';

export {
  getPeriodReturns,
  getPeriodStartDate,
} from './domain/returns.js';

export {
  getPortfolioSummary,
  getHoldings,
  getAssetAllocation,
  getAccounts,
  getPortfolioSummaryForPeriod,
  getHoldingsForPeriod,
  getRedemptionsForPeriod,
} from './domain/portfolio.js';

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
} from './domain/categorize.js';

export type {
  CategoryResolution,
  CategorizationInput,
  RecategorizeDeps,
} from './domain/categorize.js';

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
} from './domain/nav/navService.js';

export {
  autoMatchAmfiCodes,
  verifySchemeNAV,
} from './domain/amfiMatcher.js';

// ---------------------------------------------------------------------------
// Domain — valuation / loans / net-worth (L1.5)
// ---------------------------------------------------------------------------
export {
  valueAsset,
  valueComputedAsset,
  valueManualAsset,
  compoundContribution,
  type AssetInputs,
} from './domain/valuation/index.js';

export {
  computeEmi,
  amortizationSchedule,
  loanStatus,
} from './domain/loans/amortization.js';

export {
  getAllAssets,
  getNetWorth,
  getNetWorthHistory,
  type NetWorthDeps,
  type NetWorthHistoryDeps,
  type NetWorthFilters,
} from './domain/networth/networth.js';

// ---------------------------------------------------------------------------
// Import — parsers
// ---------------------------------------------------------------------------
export {
  parseHdfcStatementXls,
  type ParsedTransaction,
} from './import/hdfcParser.js';

export {
  parseGrowwTransactionXls,
  type ParsedMutualFundTransaction,
  type ParsedTransactionData,
} from './import/transactionParser.js';

export {
  parseGrowwHoldingsXls,
  type HoldingCategory,
  type ParsedHolding,
  type ParsedHoldingsData,
} from './import/holdingsParser.js';

// ---------------------------------------------------------------------------
// Import — orchestration
// ---------------------------------------------------------------------------
export {
  importTransactions,
  type ImportTransactionsResult,
  type ImportTransactionsDeps,
} from './import/importTransactions.js';

export {
  importHoldings,
  type ImportHoldingsResult,
  type ImportHoldingsDeps,
} from './import/importHoldings.js';

export {
  importInvestmentTransactions,
  // Renamed to avoid collision with importTransactions' ImportTransactionsResult.
  type ImportTransactionsResult as ImportInvestmentTransactionsResult,
  type ImportInvestmentTransactionsDeps,
} from './import/importInvestmentTransactions.js';

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
  AccountDomain,
  Account,
  AssetClass,
  ValuationStrategy,
  IngestionMode,
  CompoundingFrequency,
  AssetParams,
  Asset,
  AssetContribution,
  AssetRate,
  AssetValuation,
  Liability,
  ValuedAsset,
  AmortizationRow,
  LoanStatus,
  NetWorthClassBreakdown,
  NetWorthSummary,
  NetWorthPoint,
} from './types.js';
