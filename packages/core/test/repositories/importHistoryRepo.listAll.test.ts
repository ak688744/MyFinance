import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeImportHistoryRepo } from '../../src/repositories/importHistoryRepo';
import type { Db } from '../../src/db/client';
import type { Database as SqliteDatabase } from 'better-sqlite3';

describe('importHistoryRepo.listAll', () => {
  let db: Db;
  let sqlite: SqliteDatabase;
  let repo: ReturnType<typeof makeImportHistoryRepo>;

  beforeEach(() => {
    ({ db, sqlite } = runMigrations(':memory:'));
    repo = makeImportHistoryRepo(db);
  });
  afterEach(() => sqlite.close());

  it('returns expense and investment imports unified, date-desc', () => {
    const expId = repo.create({
      sourceName: 'hdfc.xls',
      sourceType: 'xls',
      transactionCount: 12,
    });
    const invId = repo.createInvestmentImport({
      accountName: 'Groww Main',
      investmentApp: 'groww',
      importType: 'holdings',
      fileName: 'holdings.xls',
      startDate: '2026-05-23',
      endDate: '2026-05-23',
      recordCount: 3,
    });

    const all = repo.listAll();

    expect(all).toHaveLength(2);
    const exp = all.find((r) => r.kind === 'expense' && r.id === expId);
    const inv = all.find((r) => r.kind === 'investment' && r.id === invId);

    expect(exp).toMatchObject({
      kind: 'expense',
      sourceName: 'hdfc.xls',
      importType: null,
      recordCount: 12,
      accountName: null,
      investmentApp: null,
    });
    expect(inv).toMatchObject({
      kind: 'investment',
      sourceName: 'holdings.xls',
      importType: 'holdings',
      recordCount: 3,
      accountName: 'Groww Main',
      investmentApp: 'groww',
    });
    expect(typeof exp!.importedAt).toBe('string');
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].importedAt >= all[i].importedAt).toBe(true);
    }
  });

  it('returns [] when there are no imports', () => {
    expect(repo.listAll()).toEqual([]);
  });
});
