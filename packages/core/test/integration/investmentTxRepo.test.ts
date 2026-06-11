import { describe, it, expect, beforeEach } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import { makeInvestmentTxRepo } from '../../src/repositories/investmentTxRepo';
import type { Db } from '../../src/db/client';

let repo: ReturnType<typeof makeInvestmentTxRepo>;
let sqlite: SqliteDatabase;
let db: Db;

beforeEach(() => {
  const m = runMigrations(':memory:');
  sqlite = m.sqlite;
  db = m.db;
  repo = makeInvestmentTxRepo(db);
  // FK parents: investment_transactions.scheme_id -> investment_schemes.id
  sqlite
    .prepare(
      `INSERT INTO investment_schemes (id, scheme_name)
        VALUES (1,'X'),(2,'Y'),(3,'Z')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO investment_transactions
        (scheme_id,account_name,investment_app,scheme_name,transaction_type,units,nav,amount,transaction_date)
        VALUES (1,'A','groww','X','PURCHASE',10,100,1000,'2024-01-01'),
               (1,'A','groww','X','REDEMPTION',5,120,600,'2024-06-01'),
               (2,'A','groww','Y','PURCHASE',20,50,1000,'2024-03-01'),
               (2,'B','groww','Y','PURCHASE',5,55,275,'2024-04-01'),
               (1,'A','groww','X','DIVIDEND',0,0,50,'2024-05-01')`,
    )
    .run();
});

describe('investmentTxRepo.getCashFlows', () => {
  it('purchase negative, redemption positive, asc', () => {
    const cf = repo.getCashFlows({ schemeId: 1 });
    expect(cf).toEqual([
      { date: '2024-01-01', amount: -1000 },
      { date: '2024-05-01', amount: 50 },
      { date: '2024-06-01', amount: 600 },
    ]);
  });

  it('filters by account and date range', () => {
    const cf = repo.getCashFlows({
      account: 'A',
      startDate: '2024-02-01',
      endDate: '2024-05-31',
    });
    expect(cf).toEqual([
      { date: '2024-03-01', amount: -1000 },
      { date: '2024-05-01', amount: 50 },
    ]);
  });
});

describe('investmentTxRepo.getTransactions', () => {
  it('orders by transaction_date DESC and maps to camelCase', () => {
    const txs = repo.getTransactions({ schemeId: 1 });
    expect(txs.map((t) => t.transactionDate)).toEqual([
      '2024-06-01',
      '2024-05-01',
      '2024-01-01',
    ]);
    const first = txs[0];
    expect(first).toMatchObject({
      schemeId: 1,
      schemeName: 'X',
      accountName: 'A',
      investmentApp: 'groww',
      transactionType: 'REDEMPTION',
      units: 5,
      nav: 120,
      amount: 600,
    });
    expect(typeof first.id).toBe('number');
  });

  it('filters by account', () => {
    const txs = repo.getTransactions({ account: 'B' });
    expect(txs).toHaveLength(1);
    expect(txs[0].accountName).toBe('B');
  });

  it('filters by date range (BETWEEN)', () => {
    const txs = repo.getTransactions({
      startDate: '2024-03-01',
      endDate: '2024-05-01',
    });
    expect(txs.map((t) => t.transactionDate)).toEqual([
      '2024-05-01',
      '2024-04-01',
      '2024-03-01',
    ]);
  });

  it('filters by startDate only', () => {
    const txs = repo.getTransactions({ startDate: '2024-05-01' });
    expect(txs.map((t) => t.transactionDate)).toEqual([
      '2024-06-01',
      '2024-05-01',
    ]);
  });

  it('filters by endDate only', () => {
    const txs = repo.getTransactions({ endDate: '2024-01-01' });
    expect(txs.map((t) => t.transactionDate)).toEqual(['2024-01-01']);
  });

  it('filters by type', () => {
    const txs = repo.getTransactions({ type: 'PURCHASE' });
    expect(txs).toHaveLength(3);
    expect(txs.every((t) => t.transactionType === 'PURCHASE')).toBe(true);
  });

  it('filters by schemeName', () => {
    const txs = repo.getTransactions({ schemeName: 'Y' });
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.schemeName === 'Y')).toBe(true);
  });

  it('respects limit', () => {
    const txs = repo.getTransactions({ limit: 2 });
    expect(txs).toHaveLength(2);
    expect(txs.map((t) => t.transactionDate)).toEqual([
      '2024-06-01',
      '2024-05-01',
    ]);
  });

  it('returns all rows with no filters', () => {
    const txs = repo.getTransactions();
    expect(txs).toHaveLength(5);
  });
});

describe('investmentTxRepo.getTransactionsByScheme', () => {
  it('returns only the scheme rows, DESC', () => {
    const txs = repo.getTransactionsByScheme(2);
    expect(txs).toHaveLength(2);
    expect(txs.map((t) => t.transactionDate)).toEqual([
      '2024-04-01',
      '2024-03-01',
    ]);
    expect(txs.every((t) => t.schemeId === 2)).toBe(true);
  });
});

describe('investmentTxRepo.getTransactionSummary', () => {
  it('computes purchases/redemptions/net/count over mixed types', () => {
    // purchases: 1000 + 1000 + 275 = 2275 (PURCHASE + SWITCH_IN)
    // redemptions: 600 + 50 = 650 (REDEMPTION + DIVIDEND)
    const s = repo.getTransactionSummary();
    expect(s.totalPurchases).toBe(2275);
    expect(s.totalRedemptions).toBe(650);
    expect(s.netInvestment).toBe(2275 - 650);
    expect(s.transactionCount).toBe(5);
  });

  it('filters by account', () => {
    const s = repo.getTransactionSummary({ account: 'B' });
    expect(s.totalPurchases).toBe(275);
    expect(s.totalRedemptions).toBe(0);
    expect(s.netInvestment).toBe(275);
    expect(s.transactionCount).toBe(1);
  });

  it('coalesces to 0 when no rows match', () => {
    const s = repo.getTransactionSummary({ account: 'NOPE' });
    expect(s).toEqual({
      totalPurchases: 0,
      totalRedemptions: 0,
      netInvestment: 0,
      transactionCount: 0,
    });
  });
});

describe('investmentTxRepo.getEarliestTransactionDate', () => {
  it('returns MIN(transaction_date) with no filters', () => {
    expect(repo.getEarliestTransactionDate({})).toBe('2024-01-01');
  });

  it('respects scheme filter', () => {
    expect(repo.getEarliestTransactionDate({ schemeId: 2 })).toBe('2024-03-01');
  });

  it('respects account filter', () => {
    expect(repo.getEarliestTransactionDate({ account: 'B' })).toBe('2024-04-01');
  });

  it('returns null when no rows match', () => {
    expect(repo.getEarliestTransactionDate({ account: 'NOPE' })).toBeNull();
  });
});

describe('investmentTxRepo.getUnitsPerSchemeUpTo', () => {
  it('accumulates units per scheme up to endDate', () => {
    // up to 2024-12-31: scheme1 = 10 - 5 = 5 (DIVIDEND ignored), scheme2 = 20 + 5 = 25
    const m = repo.getUnitsPerSchemeUpTo('2024-12-31', {});
    expect(m.get(1)).toBe(5);
    expect(m.get(2)).toBe(25);
  });

  it('respects endDate cutoff', () => {
    // up to 2024-02-01: only scheme1 PURCHASE (10). scheme2 absent.
    const m = repo.getUnitsPerSchemeUpTo('2024-02-01', {});
    expect(m.get(1)).toBe(10);
    expect(m.has(2)).toBe(false);
  });

  it('respects account filter', () => {
    const m = repo.getUnitsPerSchemeUpTo('2024-12-31', { account: 'B' });
    expect(m.get(2)).toBe(5);
    expect(m.has(1)).toBe(false);
  });
});

describe('investmentTxRepo.insert', () => {
  it('inserts and returns a numeric id retrievable by scheme', () => {
    const id = repo.insert({
      schemeId: 3,
      schemeName: 'Z',
      accountName: 'A',
      investmentApp: 'groww',
      transactionType: 'PURCHASE',
      units: 7,
      nav: 200,
      amount: 1400,
      transactionDate: '2024-07-01',
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const rows = repo.getTransactionsByScheme(3);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      schemeId: 3,
      schemeName: 'Z',
      transactionType: 'PURCHASE',
      units: 7,
      nav: 200,
      amount: 1400,
      transactionDate: '2024-07-01',
    });
  });
});
