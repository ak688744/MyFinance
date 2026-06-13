import { describe, it, expect, beforeEach } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import { makeExpenseTransactionRepo } from '../../src/repositories/expenseTransactionRepo';
import type { Db } from '../../src/db/client';

let repo: ReturnType<typeof makeExpenseTransactionRepo>;
let sqlite: SqliteDatabase;
let db: Db;

type ListedRow = {
  id: number;
  transactionDate: string;
  description: string;
  categoryId: string | null;
  categorySource: string | null;
};

beforeEach(() => {
  const m = runMigrations(':memory:');
  sqlite = m.sqlite;
  db = m.db;
  repo = makeExpenseTransactionRepo(db);
  sqlite
    .prepare(`INSERT INTO categories (id, name) VALUES ('food','Food'),('bills','Bills')`)
    .run();
  // 4 transactions across dates / category_source variants
  sqlite
    .prepare(
      `INSERT INTO transactions
        (transaction_date, description, normalized_description, merchant_key, upi_note_keyword,
         amount, direction, category_id, category_source, source_type, dedupe_key)
       VALUES
        ('2024-01-01','t1 manual','t1 manual','m1',NULL,100,'debit','food','manual','pdf','d1'),
        ('2024-03-01','t2 builtin','t2 builtin','m2','rent',200,'debit','bills','builtin_rule','pdf','d2'),
        ('2024-02-01','t3 null src','t3 null src',NULL,'note3',300,'debit',NULL,NULL,'pdf','d3'),
        ('2024-04-01','t4 merchant','t4 merchant','m4',NULL,400,'debit','food','merchant_rule','pdf','d4')`,
    )
    .run();
});

describe('expenseTransactionRepo.list', () => {
  it('orders by transaction_date DESC', () => {
    const rows = repo.list() as ListedRow[];
    expect(rows.map((r) => r.transactionDate)).toEqual([
      '2024-04-01',
      '2024-03-01',
      '2024-02-01',
      '2024-01-01',
    ]);
  });

  it('maps rows to camelCase', () => {
    const rows = repo.list({ limit: 1 }) as ListedRow[];
    expect(rows[0]).toMatchObject({
      transactionDate: '2024-04-01',
      description: 't4 merchant',
      categoryId: 'food',
      categorySource: 'merchant_rule',
    });
  });

  it('respects limit and offset', () => {
    const rows = repo.list({ limit: 2, offset: 1 }) as ListedRow[];
    expect(rows.map((r) => r.transactionDate)).toEqual(['2024-03-01', '2024-02-01']);
  });

  it('filters by categoryId', () => {
    const rows = repo.list({ categoryId: 'food' }) as ListedRow[];
    expect(rows.map((r) => r.transactionDate)).toEqual(['2024-04-01', '2024-01-01']);
    expect(rows.every((r) => r.categoryId === 'food')).toBe(true);
  });
});

describe('expenseTransactionRepo.getNonManualForRecategorization', () => {
  it('excludes manual, includes NULL and non-manual sources', () => {
    const rows = repo.getNonManualForRecategorization();
    const descriptions = rows.map((r) => r.description).sort();
    expect(descriptions).toEqual(['t2 builtin', 't3 null src', 't4 merchant']);
    expect(rows.some((r) => r.description === 't1 manual')).toBe(false);
  });

  it('returns id/description/merchantKey/upiNoteKeyword', () => {
    const rows = repo.getNonManualForRecategorization();
    const t3 = rows.find((r) => r.description === 't3 null src');
    expect(t3).toEqual({
      id: expect.any(Number),
      description: 't3 null src',
      merchantKey: null,
      upiNoteKeyword: 'note3',
    });
  });
});

describe('expenseTransactionRepo.insertIgnore', () => {
  beforeEach(() => {
    sqlite
      .prepare(
        `INSERT INTO import_history (id, source_name, source_type, transaction_count)
         VALUES (1, 'hdfc.xls', 'xls', 0)`,
      )
      .run();
  });

  const tx = (dedupeKey: string) => ({
    transactionDate: '2024-05-01',
    valueDate: '2024-05-01',
    referenceNumber: 'REF',
    description: 'new tx',
    normalizedDescription: 'new tx',
    merchantKey: 'shop',
    upiNoteKeyword: null,
    amount: 99,
    direction: 'debit' as const,
    categoryId: 'food',
    categorySource: 'merchant_rule',
    balance: 1000,
    sourceType: 'xls',
    importHistoryId: 1,
    dedupeKey,
    accountId: null,
  });

  it('inserts a new row (returns 1) and persists all columns', () => {
    const changes = repo.insertIgnore(tx('new-1'));
    expect(changes).toBe(1);
    const row = sqlite
      .prepare(
        `SELECT category_id, category_source, import_history_id, dedupe_key, amount
         FROM transactions WHERE dedupe_key = 'new-1'`,
      )
      .get() as Record<string, unknown>;
    expect(row).toMatchObject({
      category_id: 'food',
      category_source: 'merchant_rule',
      import_history_id: 1,
      dedupe_key: 'new-1',
      amount: 99,
    });
  });

  it('ignores a duplicate dedupe_key (returns 0, no second row)', () => {
    expect(repo.insertIgnore(tx('dup'))).toBe(1);
    expect(repo.insertIgnore(tx('dup'))).toBe(0);
    const count = sqlite
      .prepare(`SELECT COUNT(*) AS c FROM transactions WHERE dedupe_key = 'dup'`)
      .get() as { c: number };
    expect(count.c).toBe(1);
  });
});

describe('expenseTransactionRepo.updateCategory', () => {
  it('persists category_id + category_source', () => {
    const rows = repo.list() as ListedRow[];
    const target = rows.find((r) => r.description === 't3 null src')!;
    repo.updateCategory(target.id, 'bills', 'merchant_rule');
    const after = (repo.list() as ListedRow[]).find((r) => r.id === target.id)!;
    expect(after.categoryId).toBe('bills');
    expect(after.categorySource).toBe('merchant_rule');
  });

  it('persists nulls (clearing category)', () => {
    const rows = repo.list() as ListedRow[];
    const target = rows.find((r) => r.description === 't2 builtin')!;
    repo.updateCategory(target.id, null, null);
    const after = (repo.list() as ListedRow[]).find((r) => r.id === target.id)!;
    expect(after.categoryId).toBeNull();
    expect(after.categorySource).toBeNull();
  });
});
