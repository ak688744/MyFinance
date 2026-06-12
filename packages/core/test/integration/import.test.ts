import { describe, it, expect, beforeEach } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import type { Db } from '../../src/db/client';
import { makeSchemeRepo } from '../../src/repositories/schemeRepo';
import { makeHoldingsRepo } from '../../src/repositories/holdingsRepo';
import { makeInvestmentTxRepo } from '../../src/repositories/investmentTxRepo';
import { makeImportHistoryRepo } from '../../src/repositories/importHistoryRepo';
import { makeCategoryRuleRepo } from '../../src/repositories/categoryRuleRepo';
import { makeExpenseTransactionRepo } from '../../src/repositories/expenseTransactionRepo';
import { importTransactions } from '../../src/import/importTransactions';
import { importHoldings } from '../../src/import/importHoldings';
import { importInvestmentTransactions } from '../../src/import/importInvestmentTransactions';
import type { ParsedTransactionData } from '../../src/import/transactionParser';
import type { ParsedHoldingsData } from '../../src/import/holdingsParser';
import type { ParsedTransaction } from '../../src/import/hdfcParser';

let sqlite: SqliteDatabase;
let db: Db;
let schemeRepo: ReturnType<typeof makeSchemeRepo>;
let holdingsRepo: ReturnType<typeof makeHoldingsRepo>;
let investmentTxRepo: ReturnType<typeof makeInvestmentTxRepo>;
let importHistoryRepo: ReturnType<typeof makeImportHistoryRepo>;
let ruleRepo: ReturnType<typeof makeCategoryRuleRepo>;
let expenseTxRepo: ReturnType<typeof makeExpenseTransactionRepo>;

// A transaction runner built from the better-sqlite3 handle. better-sqlite3
// transactions must be synchronous; all repo writes here are synchronous.
function runInTransaction<T>(fn: () => T): T {
  return sqlite.transaction(fn)();
}

beforeEach(() => {
  const m = runMigrations(':memory:');
  sqlite = m.sqlite;
  db = m.db;
  schemeRepo = makeSchemeRepo(db);
  holdingsRepo = makeHoldingsRepo(db);
  investmentTxRepo = makeInvestmentTxRepo(db);
  importHistoryRepo = makeImportHistoryRepo(db);
  ruleRepo = makeCategoryRuleRepo(db);
  expenseTxRepo = makeExpenseTransactionRepo(db);
});

// ---------------------------------------------------------------------------
// importInvestmentTransactions
// ---------------------------------------------------------------------------

const txData = (): ParsedTransactionData => ({
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  holderName: 'Vivek',
  holderPan: 'ABCDE1234F',
  transactions: [
    {
      schemeName: 'Zeta Fund Direct Growth',
      transactionType: 'PURCHASE',
      units: 10,
      nav: 100,
      amount: 1000,
      transactionDate: '2024-03-10',
    },
    {
      schemeName: 'Alpha Fund Direct Growth',
      transactionType: 'PURCHASE',
      units: 5,
      nav: 200,
      amount: 1000,
      transactionDate: '2024-06-15',
    },
  ],
});

describe('importInvestmentTransactions', () => {
  it('pre-flight: returns unmatched_schemes (sorted) and leaves DB untouched', async () => {
    const result = await importInvestmentTransactions(
      { schemeRepo, txRepo: investmentTxRepo, importHistoryRepo, runInTransaction },
      { accountName: 'A', investmentApp: 'groww', parsedData: txData() },
    );

    expect(result.status).toBe('unmatched_schemes');
    if (result.status === 'unmatched_schemes') {
      // sorted alphabetically
      expect(result.unmatchedSchemes).toEqual([
        'Alpha Fund Direct Growth',
        'Zeta Fund Direct Growth',
      ]);
    }

    // DB untouched
    const txCount = sqlite
      .prepare('SELECT COUNT(*) AS c FROM investment_transactions')
      .get() as { c: number };
    const histCount = sqlite
      .prepare('SELECT COUNT(*) AS c FROM investment_import_history')
      .get() as { c: number };
    expect(txCount.c).toBe(0);
    expect(histCount.c).toBe(0);
  });

  it('success: resolves schemes, inserts rows; re-import replaces (delete + reinsert)', async () => {
    // Seed schemes so pre-flight matches
    schemeRepo.matchOrCreateScheme({ schemeName: 'Zeta Fund Direct Growth' });
    schemeRepo.matchOrCreateScheme({ schemeName: 'Alpha Fund Direct Growth' });

    const first = await importInvestmentTransactions(
      { schemeRepo, txRepo: investmentTxRepo, importHistoryRepo, runInTransaction },
      { accountName: 'A', investmentApp: 'groww', parsedData: txData() },
    );
    expect(first.status).toBe('success');
    if (first.status === 'success') {
      expect(first.importedCount).toBe(2);
      expect(first.deletedCount).toBe(0);
      expect(first.importHistoryId).toBeGreaterThan(0);
    }

    expect(
      (sqlite.prepare('SELECT COUNT(*) AS c FROM investment_transactions').get() as { c: number }).c,
    ).toBe(2);

    // scheme_id resolved (not null)
    const nullScheme = sqlite
      .prepare('SELECT COUNT(*) AS c FROM investment_transactions WHERE scheme_id IS NULL')
      .get() as { c: number };
    expect(nullScheme.c).toBe(0);

    // Re-import same range -> delete prior 2, reinsert 2 (no dupes beyond expected)
    const second = await importInvestmentTransactions(
      { schemeRepo, txRepo: investmentTxRepo, importHistoryRepo, runInTransaction },
      { accountName: 'A', investmentApp: 'groww', parsedData: txData() },
    );
    expect(second.status).toBe('success');
    if (second.status === 'success') {
      expect(second.deletedCount).toBe(2);
      expect(second.importedCount).toBe(2);
    }
    expect(
      (sqlite.prepare('SELECT COUNT(*) AS c FROM investment_transactions').get() as { c: number }).c,
    ).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// importHoldings
// ---------------------------------------------------------------------------

const holdingsData = (): ParsedHoldingsData => ({
  asOfDate: '2024-12-31',
  summary: {
    totalInvested: 3000,
    totalCurrentValue: 3300,
    totalXirr: 0.15,
    holderName: 'Vivek',
    holderPan: 'ABCDE1234F',
  },
  holdings: [
    {
      schemeName: 'Zeta Fund Direct Growth',
      amcName: 'Zeta AMC',
      category: 'equity',
      subCategory: 'large cap',
      folioNumber: 'F1',
      units: 10,
      investedValue: 1000,
      currentValue: 1200,
      returnsAmount: 200,
      returnsXirr: 0.2,
    },
    {
      schemeName: 'Alpha Fund Direct Growth',
      amcName: 'Alpha AMC',
      category: 'equity',
      subCategory: 'mid cap',
      folioNumber: 'F2',
      units: 5,
      investedValue: 2000,
      currentValue: 2100,
      returnsAmount: 100,
      returnsXirr: 0.05,
    },
  ],
});

// Stub the network amfi matcher so tests never hit mfapi.in.
const stubAmfiMatch = async () => ({ matched: 0, total: 0, matches: [] });

describe('importHoldings', () => {
  it('creates schemes, inserts holdings, writes import_history with totals', async () => {
    const result = await importHoldings(
      {
        schemeRepo,
        holdingsRepo,
        importHistoryRepo,
        runInTransaction,
        amfiMatch: stubAmfiMatch,
      },
      { accountName: 'A', investmentApp: 'groww', parsedData: holdingsData() },
    );

    expect(result.importedCount).toBe(2);
    expect(result.deletedCount).toBe(0);
    expect(result.importHistoryId).toBeGreaterThan(0);
    expect(result.amfiMatched).toBe(0);
    expect(result.amfiTotal).toBe(0);

    // schemes created
    expect(
      (sqlite.prepare('SELECT COUNT(*) AS c FROM investment_schemes').get() as { c: number }).c,
    ).toBe(2);
    // holdings inserted
    expect(
      (sqlite.prepare('SELECT COUNT(*) AS c FROM investment_holdings').get() as { c: number }).c,
    ).toBe(2);
    // import_history with totals
    const hist = sqlite
      .prepare(
        `SELECT import_type, total_invested, total_current_value, total_xirr, holder_name, record_count
         FROM investment_import_history WHERE id = ?`,
      )
      .get(result.importHistoryId) as Record<string, unknown>;
    expect(hist).toMatchObject({
      import_type: 'holdings',
      total_invested: 3000,
      total_current_value: 3300,
      total_xirr: 0.15,
      holder_name: 'Vivek',
      record_count: 2,
    });
  });

  it('re-import same date deletes prior holdings + history and reinserts', async () => {
    await importHoldings(
      { schemeRepo, holdingsRepo, importHistoryRepo, runInTransaction, amfiMatch: stubAmfiMatch },
      { accountName: 'A', investmentApp: 'groww', parsedData: holdingsData() },
    );

    const second = await importHoldings(
      { schemeRepo, holdingsRepo, importHistoryRepo, runInTransaction, amfiMatch: stubAmfiMatch },
      { accountName: 'A', investmentApp: 'groww', parsedData: holdingsData() },
    );

    expect(second.deletedCount).toBe(2);
    expect(second.importedCount).toBe(2);
    // Only the second import's holdings + history survive
    expect(
      (sqlite.prepare('SELECT COUNT(*) AS c FROM investment_holdings').get() as { c: number }).c,
    ).toBe(2);
    expect(
      (sqlite
        .prepare(`SELECT COUNT(*) AS c FROM investment_import_history WHERE import_type = 'holdings'`)
        .get() as { c: number }).c,
    ).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// importTransactions (HDFC expense)
// ---------------------------------------------------------------------------

const expenseTx = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
  transactionDate: '2024-03-10',
  valueDate: '2024-03-10',
  referenceNumber: 'REF1',
  description: 'UPI-ZEPTO-something',
  normalizedDescription: 'upi zepto something',
  merchantKey: 'zepto',
  upiNoteKeyword: null,
  amount: 250,
  direction: 'debit',
  balance: 5000,
  sourceType: 'xls',
  dedupeKey: 'dk-1',
  ...overrides,
});

describe('importTransactions (HDFC expense)', () => {
  beforeEach(() => {
    // Seed a category + a merchant rule so categorization resolves.
    sqlite
      .prepare(`INSERT INTO categories (id, name) VALUES ('groceries', 'Groceries')`)
      .run();
    ruleRepo.createRule({
      ruleType: 'merchant',
      patternValue: 'zepto',
      categoryId: 'groceries',
      priority: 200,
    });
  });

  it('inserts transactions, resolves category via rules, returns counts', async () => {
    const result = await importTransactions(
      { importHistoryRepo, ruleRepo, txRepo: expenseTxRepo, runInTransaction },
      {
        sourceName: 'hdfc.xls',
        sourceType: 'xls',
        transactions: [expenseTx(), expenseTx({ dedupeKey: 'dk-2', merchantKey: null, description: 'misc' })],
      },
    );

    expect(result.detectedCount).toBe(2);
    expect(result.insertedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.importHistoryId).toBeGreaterThan(0);

    const row = sqlite
      .prepare(`SELECT category_id, category_source FROM transactions WHERE dedupe_key = 'dk-1'`)
      .get() as { category_id: string; category_source: string };
    expect(row.category_id).toBe('groceries');
    expect(row.category_source).toBe('merchant_rule');
  });

  it('dedupes on dedupe_key (INSERT OR IGNORE): re-import skips', async () => {
    const deps = { importHistoryRepo, ruleRepo, txRepo: expenseTxRepo, runInTransaction };
    const input = { sourceName: 'hdfc.xls', sourceType: 'xls' as const, transactions: [expenseTx()] };

    const first = await importTransactions(deps, input);
    expect(first.insertedCount).toBe(1);

    const second = await importTransactions(deps, input);
    expect(second.detectedCount).toBe(1);
    expect(second.insertedCount).toBe(0);
    expect(second.skippedCount).toBe(1);

    expect(
      (sqlite.prepare('SELECT COUNT(*) AS c FROM transactions').get() as { c: number }).c,
    ).toBe(1);
  });
});
