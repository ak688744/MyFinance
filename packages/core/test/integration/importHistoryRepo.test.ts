import { describe, it, expect, beforeEach } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import { makeImportHistoryRepo } from '../../src/repositories/importHistoryRepo';
import type { Db } from '../../src/db/client';

let repo: ReturnType<typeof makeImportHistoryRepo>;
let sqlite: SqliteDatabase;
let db: Db;

beforeEach(() => {
  const m = runMigrations(':memory:');
  sqlite = m.sqlite;
  db = m.db;
  repo = makeImportHistoryRepo(db);
});

describe('importHistoryRepo.create', () => {
  it('inserts import_history and returns a numeric id', () => {
    const id = repo.create({ sourceName: 'hdfc.pdf', sourceType: 'pdf', transactionCount: 42 });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = sqlite
      .prepare(`SELECT source_name, source_type, transaction_count FROM import_history WHERE id = ?`)
      .get(id) as { source_name: string; source_type: string; transaction_count: number };
    expect(row).toEqual({ source_name: 'hdfc.pdf', source_type: 'pdf', transaction_count: 42 });
  });
});

describe('importHistoryRepo.createInvestmentImport', () => {
  it('inserts investment_import_history and returns a numeric id', () => {
    const id = repo.createInvestmentImport({
      accountName: 'A',
      investmentApp: 'groww',
      importType: 'transactions',
      fileName: 'groww.xlsx',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      recordCount: 10,
      totalInvested: 5000,
      totalCurrentValue: 6000,
      totalXirr: 0.18,
      holderName: 'Vivek',
      holderPan: 'ABCDE1234F',
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
    const row = sqlite
      .prepare(
        `SELECT account_name, investment_app, import_type, file_name, start_date, end_date,
                record_count, total_invested, total_current_value, total_xirr, holder_name, holder_pan
         FROM investment_import_history WHERE id = ?`,
      )
      .get(id) as Record<string, unknown>;
    expect(row).toEqual({
      account_name: 'A',
      investment_app: 'groww',
      import_type: 'transactions',
      file_name: 'groww.xlsx',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      record_count: 10,
      total_invested: 5000,
      total_current_value: 6000,
      total_xirr: 0.18,
      holder_name: 'Vivek',
      holder_pan: 'ABCDE1234F',
    });
  });

  it('findInvestmentImports matches on account/app/type/dates; deleteInvestmentImport removes', () => {
    const id = repo.createInvestmentImport({
      accountName: 'A',
      investmentApp: 'groww',
      importType: 'holdings',
      startDate: '2024-12-31',
      endDate: '2024-12-31',
    });
    // A different row that must NOT match (different type).
    repo.createInvestmentImport({
      accountName: 'A',
      investmentApp: 'groww',
      importType: 'transactions',
      startDate: '2024-12-31',
      endDate: '2024-12-31',
    });

    const found = repo.findInvestmentImports({
      account: 'A',
      app: 'groww',
      importType: 'holdings',
      startDate: '2024-12-31',
      endDate: '2024-12-31',
    });
    expect(found).toEqual([{ id }]);

    repo.deleteInvestmentImport(id);
    expect(
      repo.findInvestmentImports({
        account: 'A',
        app: 'groww',
        importType: 'holdings',
        startDate: '2024-12-31',
        endDate: '2024-12-31',
      }),
    ).toEqual([]);
  });

  it('inserts with only required fields (optionals -> null)', () => {
    const id = repo.createInvestmentImport({
      accountName: 'B',
      investmentApp: 'groww',
      importType: 'holdings',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    const row = sqlite
      .prepare(
        `SELECT file_name, record_count, total_invested, holder_name FROM investment_import_history WHERE id = ?`,
      )
      .get(id) as Record<string, unknown>;
    expect(row).toEqual({
      file_name: null,
      record_count: null,
      total_invested: null,
      holder_name: null,
    });
  });
});
