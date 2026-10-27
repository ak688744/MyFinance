import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeSchemeRepo } from '../../src/repositories/schemeRepo';
import { makeInvestmentTxRepo } from '../../src/repositories/investmentTxRepo';
import { makeHoldingsRepo } from '../../src/repositories/holdingsRepo';
import { makeImportHistoryRepo } from '../../src/repositories/importHistoryRepo';
import type { Db } from '../../src/db/client';
import type { Database as SqliteDatabase } from 'better-sqlite3';

describe('CAS repo additions', () => {
  let db: Db;
  let sqlite: SqliteDatabase;
  beforeEach(() => {
    ({ db, sqlite } = runMigrations(':memory:'));
  });
  afterEach(() => sqlite.close());

  it('findByIsin hit/miss, setIsin then find', () => {
    const repo = makeSchemeRepo(db);
    const id = repo.matchOrCreateScheme({ schemeName: 'Fund A' });
    expect(repo.findByIsin('INF000A01011')).toBeNull();
    repo.setIsin(id, 'INF000A01011');
    expect(repo.findByIsin('INF000A01011')?.id).toBe(id);
    expect(repo.findByIsin('INF999')).toBeNull();
  });

  it('createScheme stores isin, amfi, category; duplicate name+amc returns existing id', () => {
    const repo = makeSchemeRepo(db);
    const id = repo.createScheme({
      schemeName: 'Fund B', isin: 'INF000B01011', amfiCode: '123456',
      amcName: 'AMC B', category: 'equity',
    });
    const s = repo.getSchemeById(id)!;
    expect(s.isin).toBe('INF000B01011');
    expect(s.amfiCode).toBe('123456');
    expect(s.category).toBe('equity');
    expect(s.amcName).toBe('AMC B');
    const again = repo.createScheme({ schemeName: 'Fund B', amcName: 'AMC B' });
    expect(again).toBe(id);
  });

  function seedTx(
    repo: ReturnType<typeof makeInvestmentTxRepo>, schemeId: number,
    account: string, app: string, date: string,
  ) {
    repo.insert({
      schemeId, accountName: account, investmentApp: app, schemeName: 'Fund A',
      transactionType: 'PURCHASE', units: 1, nav: 10, amount: 10, transactionDate: date,
    });
  }

  it('deleteByAccountUpToDate removes only account rows <= endDate across apps and reports byApp', () => {
    const schemeId = makeSchemeRepo(db).matchOrCreateScheme({ schemeName: 'Fund A' });
    const repo = makeInvestmentTxRepo(db);
    seedTx(repo, schemeId, 'Acc1', 'Groww', '2024-01-01');
    seedTx(repo, schemeId, 'Acc1', 'Groww', '2024-02-01');
    seedTx(repo, schemeId, 'Acc1', 'CAS', '2024-03-01');
    seedTx(repo, schemeId, 'Acc1', 'CAS', '2024-06-01'); // later, kept
    seedTx(repo, schemeId, 'Acc2', 'Groww', '2024-01-01'); // other account, kept

    const res = repo.deleteByAccountUpToDate('Acc1', '2024-03-01');
    expect(res).toEqual({ deleted: 3, byApp: { Groww: 2, CAS: 1 } });
    expect(repo.getTransactions({ account: 'Acc1' })).toHaveLength(1);
    expect(repo.getTransactions({ account: 'Acc2' })).toHaveLength(1);
    expect(repo.deleteByAccountUpToDate('Acc1', '2020-01-01')).toEqual({ deleted: 0, byApp: {} });
  });

  it('latestCasPanHash returns newest CAS row with non-null pan; ignores other apps/accounts/nulls', () => {
    const repo = makeImportHistoryRepo(db);
    const mk = (account: string, app: string, pan?: string) =>
      repo.createInvestmentImport({
        accountName: account, investmentApp: app, importType: 'transactions',
        startDate: '2024-01-01', endDate: '2024-02-01', holderPan: pan,
      });
    expect(repo.latestCasPanHash('Acc1')).toBeNull();
    mk('Acc1', 'CAS', 'hash-old');
    mk('Acc1', 'CAS', 'hash-new');
    mk('Acc1', 'CAS'); // null pan, newest: ignored
    mk('Acc1', 'Groww', 'hash-groww');
    mk('Acc2', 'CAS', 'hash-other');
    expect(repo.latestCasPanHash('Acc1')).toBe('hash-new');
    expect(repo.latestCasPanHash('Acc3')).toBeNull();
  });

  it('accountsWithPanHash returns accounts whose LATEST CAS hash equals the hash', () => {
    const repo = makeImportHistoryRepo(db);
    const mk = (account: string, app: string, pan?: string) =>
      repo.createInvestmentImport({
        accountName: account, investmentApp: app, importType: 'transactions',
        startDate: '2024-01-01', endDate: '2024-02-01', holderPan: pan,
      });
    mk('A1', 'CAS', 'h1'); mk('A1', 'CAS', 'h2'); // A1 latest = h2
    mk('A2', 'CAS', 'h1');                        // A2 latest = h1
    mk('A3', 'Groww', 'h1');                      // not CAS
    mk('A2', 'CAS');                              // null ignored
    expect(repo.accountsWithPanHash('h1')).toEqual(['A2']);
    expect(repo.accountsWithPanHash('h2')).toEqual(['A1']);
    expect(repo.accountsWithPanHash('zzz')).toEqual([]);
  });

  describe('getSchemesWithAmfi (C1: transaction-derived)', () => {
    it('unions transaction schemes with holdings schemes, dedupes, filters by account, skips null amfi', () => {
      const schemeRepo = makeSchemeRepo(db);
      const txRepo = makeInvestmentTxRepo(db);
      const holdingsRepo = makeHoldingsRepo(db);
      const a = schemeRepo.createScheme({ schemeName: 'A', amfiCode: '111' });
      const b = schemeRepo.createScheme({ schemeName: 'B', amfiCode: '222' });
      const c = schemeRepo.createScheme({ schemeName: 'C', amfiCode: '333' });
      const noCode = schemeRepo.createScheme({ schemeName: 'D' });
      const tx = (schemeId: number, account: string) => txRepo.insert({
        schemeId, schemeName: 'x', accountName: account, investmentApp: 'CAS',
        transactionType: 'PURCHASE', units: 1, nav: 1, amount: 1, transactionDate: '2024-01-01',
      });
      tx(a, 'Acc1'); tx(a, 'Acc1'); tx(noCode, 'Acc1'); tx(b, 'Acc2');
      // legacy account: holdings snapshot only (c), and also holds a (dedupe)
      const hid = makeImportHistoryRepo(db).createInvestmentImport({
        accountName: 'Acc1', investmentApp: 'Groww', importType: 'holdings', startDate: '2024-02-01', endDate: '2024-02-01',
      });
      for (const sid of [c, a]) holdingsRepo.insert({
        importHistoryId: hid, schemeId: sid, accountName: 'Acc1', investmentApp: 'Groww', schemeName: 'x',
        folioNumber: null, units: 1, investedValue: 1, currentValue: 1, returnsAmount: 0, returnsXirr: 0, asOfDate: '2024-02-01',
      } as never);
      const sort = (r: { schemeId: number }[]) => r.map((x) => x.schemeId).sort((x, y) => x - y);
      expect(sort(schemeRepo.getSchemesWithAmfi({ account: 'Acc1' }))).toEqual([a, c]);
      expect(sort(schemeRepo.getSchemesWithAmfi({ account: 'Acc2' }))).toEqual([b]);
      expect(sort(schemeRepo.getSchemesWithAmfi({}))).toEqual([a, b, c]);
      expect(schemeRepo.getSchemesWithAmfi({ account: 'Acc1' }).find((r) => r.schemeId === a)!.amfiCode).toBe('111');
    });
  });
});
