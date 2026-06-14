import { describe, it, expect, beforeEach } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import { makeExpenseTransactionRepo } from '../../src/repositories/expenseTransactionRepo';

let sqlite: SqliteDatabase;
let repo: ReturnType<typeof makeExpenseTransactionRepo>;

beforeEach(() => {
  const m = runMigrations(':memory:');
  sqlite = m.sqlite;
  repo = makeExpenseTransactionRepo(m.db);
  sqlite.prepare(`INSERT INTO accounts (id, domain, institution, label) VALUES (1,'expense','HDFC','Salary')`).run();
  sqlite.prepare(`INSERT INTO import_history (id, source_name, source_type, transaction_count) VALUES (1,'f','hdfc',0)`).run();
});

describe('expenseTransactionRepo account_id', () => {
  it('insertIgnore persists account_id', () => {
    repo.insertIgnore({
      transactionDate: '2024-01-01', valueDate: null, referenceNumber: null,
      description: 'X', normalizedDescription: 'x', merchantKey: null, upiNoteKeyword: null,
      amount: 100, direction: 'debit', categoryId: null, categorySource: null,
      balance: null, sourceType: 'hdfc', importHistoryId: 1, dedupeKey: 'k1', accountId: 1,
    });
    const row = sqlite.prepare('SELECT account_id FROM transactions WHERE dedupe_key = ?').get('k1') as any;
    expect(row.account_id).toBe(1);
  });

  it('updateAccount sets account_id on an existing row', () => {
    repo.insertIgnore({
      transactionDate: '2024-01-01', valueDate: null, referenceNumber: null,
      description: 'Y', normalizedDescription: 'y', merchantKey: null, upiNoteKeyword: null,
      amount: 50, direction: 'debit', categoryId: null, categorySource: null,
      balance: null, sourceType: 'hdfc', importHistoryId: 1, dedupeKey: 'k2', accountId: null,
    });
    const id = (sqlite.prepare('SELECT id FROM transactions WHERE dedupe_key = ?').get('k2') as any).id;
    repo.updateAccount(id, 1);
    const row = sqlite.prepare('SELECT account_id FROM transactions WHERE id = ?').get(id) as any;
    expect(row.account_id).toBe(1);
  });
});
