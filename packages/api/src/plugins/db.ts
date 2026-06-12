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
  type Db,
  type InvestmentTxRepo,
  type SchemeRepo,
  type HoldingsRepo,
  type CategoryRepo,
  type CategoryRuleRepo,
  type ExpenseTransactionRepo,
  type ImportHistoryRepo,
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

  const repos: Repos = {
    txRepo: makeInvestmentTxRepo(db),
    schemeRepo: makeSchemeRepo(db),
    holdingsRepo: makeHoldingsRepo(db),
    categoryRepo: makeCategoryRepo(db),
    categoryRuleRepo: makeCategoryRuleRepo(db),
    expenseTxRepo: makeExpenseTransactionRepo(db),
    importHistoryRepo: makeImportHistoryRepo(db),
  };

  app.decorate('db', db);
  app.decorate('sqlite', sqlite);
  app.decorate('repos', repos);

  // Close the underlying sqlite handle when the server shuts down.
  app.addHook('onClose', async () => {
    sqlite.close();
  });
}
