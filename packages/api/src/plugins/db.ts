import type { FastifyInstance } from 'fastify';
import {
  runMigrations,
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
  seedDatabase,
  type Db,
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

// Derived from core's runMigrations return type to avoid a direct
// better-sqlite3 dependency in the api package.
export type Sqlite = ReturnType<typeof runMigrations>['sqlite'];

export type Repos = {
  txRepo: InvestmentTxRepo;
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

// Module augmentation so app.db / app.sqlite / app.repos are typed everywhere.
declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    sqlite: Sqlite;
    repos: Repos;
  }
}

/**
 * Run migrations against dbPath, build the repos, and decorate the Fastify
 * instance. Called directly from buildServer (NOT via app.register) so the
 * decorations attach to the root instance rather than an encapsulated scope.
 */
export async function registerDb(app: FastifyInstance, dbPath: string): Promise<void> {
  const { db, sqlite } = runMigrations(dbPath);

  // Seed starter categories (idempotent; INSERT OR IGNORE) and run an initial
  // recategorize so categories exist for reads and rule CRUD on a fresh DB.
  seedDatabase(db);

  const repos: Repos = {
    txRepo: makeInvestmentTxRepo(db),
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

  app.decorate('db', db);
  app.decorate('sqlite', sqlite);
  app.decorate('repos', repos);

  // Close the underlying sqlite handle when the server shuts down.
  app.addHook('onClose', async () => {
    sqlite.close();
  });
}
