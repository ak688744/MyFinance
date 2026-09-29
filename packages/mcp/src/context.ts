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
  makeSchemeFundamentalsRepo,
  makeSchemeHoldingsRepo,
  getLatestNAV,
  getNAVForDate,
  getNAVHistory,
  searchSchemes,
  ingestFundData,
  fetchGrowwFundData,
  fetchTickertapeFundData,
  fetchKuveraFundData,
  type Db,
  type NavLookup,
  type SchemeInfo,
  type NAVData,
  type FundDataSource,
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
  type SchemeFundamentalsRepo,
  type SchemeHoldingsRepo,
} from '@myfinance/core';

// Derived from core's runMigrations return type to avoid a direct better-sqlite3
// dependency in the mcp package (seam invariant).
type Sqlite = ReturnType<typeof runMigrations>['sqlite'];

export type MarketData = {
  searchSchemes: (query: string) => Promise<SchemeInfo[]>;
  getLatestNAV: (amfiCode: string) => Promise<number | null>;
  getNAVHistory: (amfiCode: string, startDate: string, endDate: string) => Promise<NAVData[]>;
};

export type FundDataIngestResult = {
  schemeId: number;
  source: string;
  asOfDate: string;
  holdingsCount: number;
};

export type FundData = {
  ingest: (
    amfiCode: string,
    opts?: { source?: FundDataSource },
  ) => Promise<FundDataIngestResult>;
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
  schemeFundamentalsRepo: SchemeFundamentalsRepo;
  schemeHoldingsRepo: SchemeHoldingsRepo;
};

export type McpContext = {
  db: Db;
  sqlite: Sqlite;
  repos: McpRepos;
  nav: NavLookup;
  marketData: MarketData;
  fundData: FundData;
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

function makeRealFundData(
  repos: McpRepos,
  runInTransaction: <T>(fn: () => T) => T,
): FundData {
  return {
    ingest: (amfiCode, opts) =>
      ingestFundData(
        {
          schemeRepo: repos.schemeRepo,
          fundamentalsRepo: repos.schemeFundamentalsRepo,
          holdingsRepo: repos.schemeHoldingsRepo,
          runInTransaction,
          adapters: [
            { source: 'groww', fetch: (code, fetchCtx) => fetchGrowwFundData(code, fetchCtx) },
            {
              source: 'tickertape',
              fetch: (code, fetchCtx) => fetchTickertapeFundData(code, fetchCtx),
            },
            { source: 'kuvera', fetch: (code, fetchCtx) => fetchKuveraFundData(code, fetchCtx) },
          ],
        },
        amfiCode,
        opts,
      ),
  };
}

export function buildContext(
  opts: { dbPath?: string; marketData?: MarketData; fundData?: FundData } = {},
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
    schemeFundamentalsRepo: makeSchemeFundamentalsRepo(db),
    schemeHoldingsRepo: makeSchemeHoldingsRepo(db),
  };

  const nav: NavLookup = {
    getNAVForDate: (code, date) => getNAVForDate(code, date),
    getLatestNAV: (code) => getLatestNAV(code),
  };

  const runInTransaction = <T>(fn: () => T): T => sqlite.transaction(fn)();

  return {
    db,
    sqlite,
    repos,
    nav,
    marketData: opts.marketData ?? realMarketData,
    fundData: opts.fundData ?? makeRealFundData(repos, runInTransaction),
    runInTransaction,
    close: () => sqlite.close(),
  };
}
