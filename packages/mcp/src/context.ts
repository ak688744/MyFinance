import {
  runMigrations,
  seedDatabase,
  makeInvestmentTxRepo,
  makeSchemeRepo,
  makeHoldingsRepo,
  makeCategoryRepo,
  makeCategoryRuleRepo,
  makeExpenseTransactionRepo,
  makeImportHistoryRepo,
  makeAccountRepo,
  makeAssetRepo,
  makeAssetContributionRepo,
  makeAssetRateRepo,
  makeAssetValuationRepo,
  makeLiabilityRepo,
  getLatestNAV,
  getNAVForDate,
  getNAVHistory,
  searchSchemes,
  type Db,
  type NavLookup,
  type SchemeInfo,
  type NAVData,
  type InvestmentTxRepo,
  type SchemeRepo,
  type HoldingsRepo,
  type CategoryRepo,
  type CategoryRuleRepo,
  type ExpenseTransactionRepo,
  type ImportHistoryRepo,
  type AccountRepo,
  type AssetRepo,
  type AssetContributionRepo,
  type AssetRateRepo,
  type AssetValuationRepo,
  type LiabilityRepo,
} from '@myfinance/core';

// Derived from core's runMigrations return type to avoid a direct better-sqlite3
// dependency in the mcp package (seam invariant).
type Sqlite = ReturnType<typeof runMigrations>['sqlite'];

export type MarketData = {
  searchSchemes: (query: string) => Promise<SchemeInfo[]>;
  getLatestNAV: (amfiCode: string) => Promise<number | null>;
  getNAVHistory: (amfiCode: string, startDate: string, endDate: string) => Promise<NAVData[]>;
};

export type McpRepos = {
  investmentTxRepo: InvestmentTxRepo;
  schemeRepo: SchemeRepo;
  holdingsRepo: HoldingsRepo;
  categoryRepo: CategoryRepo;
  categoryRuleRepo: CategoryRuleRepo;
  expenseTxRepo: ExpenseTransactionRepo;
  importHistoryRepo: ImportHistoryRepo;
  accountRepo: AccountRepo;
  assetRepo: AssetRepo;
  assetContributionRepo: AssetContributionRepo;
  assetRateRepo: AssetRateRepo;
  assetValuationRepo: AssetValuationRepo;
  liabilityRepo: LiabilityRepo;
};

export type McpContext = {
  db: Db;
  sqlite: Sqlite;
  repos: McpRepos;
  nav: NavLookup;
  marketData: MarketData;
  /** RESERVED write seam (D8) — built, unused in L3. */
  runInTransaction: <T>(fn: () => T) => T;
  close: () => void;
};

// Real market-data adapter over core's navService (default when not injected).
const realMarketData: MarketData = {
  searchSchemes: (q) => searchSchemes(q),
  getLatestNAV: (code) => getLatestNAV(code),
  getNAVHistory: (code, start, end) => getNAVHistory(code, start, end),
};

export function buildContext(
  opts: { dbPath?: string; marketData?: MarketData } = {},
): McpContext {
  const { db, sqlite } = runMigrations(opts.dbPath ?? ':memory:');
  seedDatabase(db);

  const repos: McpRepos = {
    investmentTxRepo: makeInvestmentTxRepo(db),
    schemeRepo: makeSchemeRepo(db),
    holdingsRepo: makeHoldingsRepo(db),
    categoryRepo: makeCategoryRepo(db),
    categoryRuleRepo: makeCategoryRuleRepo(db),
    expenseTxRepo: makeExpenseTransactionRepo(db),
    importHistoryRepo: makeImportHistoryRepo(db),
    accountRepo: makeAccountRepo(db),
    assetRepo: makeAssetRepo(db),
    assetContributionRepo: makeAssetContributionRepo(db),
    assetRateRepo: makeAssetRateRepo(db),
    assetValuationRepo: makeAssetValuationRepo(db),
    liabilityRepo: makeLiabilityRepo(db),
  };

  const nav: NavLookup = {
    getNAVForDate: (code, date) => getNAVForDate(code, date),
    getLatestNAV: (code) => getLatestNAV(code),
  };

  return {
    db,
    sqlite,
    repos,
    nav,
    marketData: opts.marketData ?? realMarketData,
    runInTransaction: <T>(fn: () => T): T => sqlite.transaction(fn)(),
    close: () => sqlite.close(),
  };
}
