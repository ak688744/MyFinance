import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import { makeSchemeRepo } from '../../src/repositories/schemeRepo';
import { makeInvestmentTxRepo } from '../../src/repositories/investmentTxRepo';
import { makeHoldingsRepo } from '../../src/repositories/holdingsRepo';
import { makeImportHistoryRepo } from '../../src/repositories/importHistoryRepo';
import { buildCasImport, type ParsedCasImport } from '../../src/import/casReconcile';
import { importCas, inferCategory, cleanSchemeTitle, CasServiceError, type ImportCasDeps } from '../../src/import/importCas';

const fx = (n: string) => buildCasImport(readFileSync(join(__dirname, '../fixtures/cas', n), 'utf8'));
const ISIN = 'INF123A01012';

let sqlite: SqliteDatabase;
let schemeRepo: ReturnType<typeof makeSchemeRepo>;
let txRepo: ReturnType<typeof makeInvestmentTxRepo>;
let holdingsRepo: ReturnType<typeof makeHoldingsRepo>;
let historyRepo: ReturnType<typeof makeImportHistoryRepo>;
let loadIsinIndex: ReturnType<typeof vi.fn>;

const hash = (pan: string) => createHmac('sha256', 'k').update(pan).digest('hex');
const deps = (over: Partial<ImportCasDeps> = {}): ImportCasDeps => ({
  schemeRepo, txRepo, holdingsRepo, importHistoryRepo: historyRepo,
  runInTransaction: (fn) => sqlite.transaction(fn)(),
  loadIsinIndex: loadIsinIndex as unknown as ImportCasDeps['loadIsinIndex'],
  panHash: hash,
  ...over,
});
const count = (sql = 'SELECT count(*) c FROM investment_transactions') => (sqlite.prepare(sql).get() as { c: number }).c;
const withPan = (d: ParsedCasImport, pan: string | null): ParsedCasImport => ({ ...d, holderPan: pan });

beforeEach(() => {
  const m = runMigrations(':memory:');
  sqlite = m.sqlite;
  schemeRepo = makeSchemeRepo(m.db);
  txRepo = makeInvestmentTxRepo(m.db);
  historyRepo = makeImportHistoryRepo(m.db);
  holdingsRepo = makeHoldingsRepo(m.db);
  loadIsinIndex = vi.fn(async () => new Map<string, string>());
});

describe('inferCategory', () => {
  it('classifies', () => {
    expect(inferCategory('Axis Ultra Short Term fund - Direct Growth')).toBe('debt');
    expect(inferCategory('Invesco India Arbitrage Fund')).toBe('hybrid');
    expect(inferCategory('Nifty 50 Index Fund')).toBe('equity');
    expect(inferCategory('Something Opaque')).toBeNull();
  });

  it('M6: hybrid is checked before debt', () => {
    expect(inferCategory('Test Equity & Debt Fund - Direct Growth')).toBe('hybrid');
    expect(inferCategory('Test Ultra Short Term Fund')).toBe('debt');
    expect(inferCategory('Test Corporate Bond Fund')).toBe('debt');
    expect(inferCategory('Test Banking & PSU Debt Fund')).toBe('debt');
  });
});

describe('importCas', () => {
  it('first import creates schemes and inserts rows as CAS', async () => {
    const data = fx('cas-single.txt');
    const r = await importCas(deps(), { accountName: 'A', data });
    expect(r.importedCount).toBe(3);
    expect(r.deletedCount).toBe(0);
    expect(r.schemesCreated).toHaveLength(1);
    const s = schemeRepo.findByIsin(ISIN)!;
    expect(s.amfiCode).toBeNull();
    expect(s.category).toBe('equity');
    expect(count("SELECT count(*) c FROM investment_transactions WHERE investment_app='CAS' AND account_name='A'")).toBe(3);
  });

  it('re-import is idempotent', async () => {
    const data = fx('cas-single.txt');
    await importCas(deps(), { accountName: 'A', data });
    const r2 = await importCas(deps(), { accountName: 'A', data });
    expect(r2.importedCount).toBe(3);
    expect(r2.deletedCount).toBe(3);
    expect(r2.schemesCreated).toEqual([]);
    expect(count()).toBe(3);
    expect(count('SELECT count(*) c FROM investment_schemes')).toBe(1);
  });

  it('replaces other apps up to periodEnd, keeps later rows', async () => {
    const data = fx('cas-single.txt');
    const sid = schemeRepo.createScheme({ schemeName: 'Old', isin: 'INF999Z99999' });
    const mk = (d: string) => txRepo.insert({ schemeId: sid, schemeName: 'Old', accountName: 'A', investmentApp: 'Groww', transactionType: 'PURCHASE', units: 1, nav: 1, amount: 1, transactionDate: d });
    mk('2024-01-01'); mk('2024-02-01'); mk('2027-01-01');
    const r = await importCas(deps(), { accountName: 'A', data });
    expect(r.replacedOtherApps).toEqual({ Groww: 2 });
    expect(r.deletedCount).toBe(2);
    expect(count("SELECT count(*) c FROM investment_transactions WHERE investment_app='Groww'")).toBe(1);
    expect((sqlite.prepare("SELECT transaction_date d FROM investment_transactions WHERE investment_app='Groww'").get() as { d: string }).d).toBe('2027-01-01');
  });

  it('reuses scheme found by AMFI code and backfills ISIN', async () => {
    const id = schemeRepo.createScheme({ schemeName: 'Nova Bluechip Fund Direct', amfiCode: '777' });
    loadIsinIndex.mockResolvedValue(new Map([[ISIN, '777']]));
    const r = await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
    expect(r.schemesCreated).toEqual([]);
    expect(schemeRepo.findByIsin(ISIN)!.id).toBe(id);
    expect(count('SELECT count(*) c FROM investment_schemes')).toBe(1);
  });

  it('creates with AMFI code when index knows it', async () => {
    loadIsinIndex.mockResolvedValue(new Map([[ISIN, '888']]));
    await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
    expect(schemeRepo.findByIsin(ISIN)!.amfiCode).toBe('888');
  });

  it('two folios same ISIN -> one scheme, all rows', async () => {
    const r = await importCas(deps(), { accountName: 'A', data: fx('cas-two-folios-same-isin.txt') });
    expect(r.importedCount).toBe(3);
    expect(count('SELECT count(*) c FROM investment_schemes')).toBe(1);
  });

  it('identical same-day purchases both inserted', async () => {
    const data = fx('cas-single.txt');
    const t = data.transactions[0];
    const dup: ParsedCasImport = { ...data, transactions: [t, { ...t }] };
    const r = await importCas(deps(), { accountName: 'A', data: dup });
    expect(r.importedCount).toBe(2);
    expect(count()).toBe(2);
  });

  it('PAN mismatch -> 409 unless confirmed; nothing written on 409', async () => {
    const data = fx('cas-single.txt');
    await importCas(deps(), { accountName: 'A', data: withPan(data, 'AAAAA1111A') });
    const before = count();
    await expect(importCas(deps(), { accountName: 'A', data: withPan(data, 'BBBBB2222B') }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(count()).toBe(before);
    const ok = await importCas(deps(), { accountName: 'A', data: withPan(data, 'BBBBB2222B'), confirmPanChange: true });
    expect(ok.panGuard).toBe('checked');
    // same PAN passes
    await importCas(deps(), { accountName: 'A', data: withPan(data, 'BBBBB2222B') });
  });

  it('stores hash, never raw PAN', async () => {
    await importCas(deps(), { accountName: 'A', data: withPan(fx('cas-single.txt'), 'AAAAA1111A') });
    const v = (sqlite.prepare('SELECT holder_pan p FROM investment_import_history').get() as { p: string }).p;
    expect(v).toBe(hash('AAAAA1111A'));
    expect(v).not.toContain('AAAAA1111A');
  });

  it('panHash null -> skipped, holder_pan null', async () => {
    const r = await importCas(deps({ panHash: null }), { accountName: 'A', data: withPan(fx('cas-single.txt'), 'AAAAA1111A') });
    expect(r.panGuard).toBe('skipped');
    expect((sqlite.prepare('SELECT holder_pan p FROM investment_import_history').get() as { p: unknown }).p).toBeNull();
  });

  it('index load failure with unknown ISIN -> 502, nothing written', async () => {
    loadIsinIndex.mockRejectedValue(new Error('net'));
    const p = importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
    await expect(p).rejects.toBeInstanceOf(CasServiceError);
    await expect(p).rejects.toMatchObject({ statusCode: 502 });
    expect(count()).toBe(0);
    expect(count('SELECT count(*) c FROM investment_schemes')).toBe(0);
    expect(count('SELECT count(*) c FROM investment_import_history')).toBe(0);
  });

  it('index not loaded when all ISINs already known', async () => {
    schemeRepo.createScheme({ schemeName: 'X', isin: ISIN });
    await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
    expect(loadIsinIndex).not.toHaveBeenCalled();
  });

  describe('ISIN safety (fix round 1)', () => {
    const isinOf = (id: number) => schemeRepo.getSchemeById(id)!.isin;

    it('(a) by-code reuse keeps an existing different ISIN', async () => {
      const id = schemeRepo.createScheme({ schemeName: 'Nova Other', isin: 'INF000A00001', amfiCode: '777' });
      loadIsinIndex.mockResolvedValue(new Map([[ISIN, '777']]));
      await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
      expect(isinOf(id)).toBe('INF000A00001');
      expect(count('SELECT count(*) c FROM investment_schemes')).toBe(1);
      expect(count(`SELECT count(*) c FROM investment_transactions WHERE scheme_id=${id}`)).toBe(3);
    });

    it('(b) two ISINs of one AMFI code -> one scheme, first ISIN kept', async () => {
      const data = fx('cas-single.txt');
      const t = data.transactions[0];
      const two: ParsedCasImport = { ...data, transactions: [t, { ...t, isin: 'INF123A01020', schemeTitle: 'Nova Bluechip Fund - IDCW' }] };
      loadIsinIndex.mockResolvedValue(new Map([[ISIN, '777'], ['INF123A01020', '777']]));
      const id = schemeRepo.createScheme({ schemeName: 'Zed', amfiCode: '777' });
      await importCas(deps(), { accountName: 'A', data: two });
      expect(count('SELECT count(*) c FROM investment_schemes')).toBe(1);
      expect(isinOf(id)).toBe(ISIN);
      expect(count(`SELECT count(*) c FROM investment_transactions WHERE scheme_id=${id}`)).toBe(2);
    });

    const title = () => cleanSchemeTitle(fx('cas-single.txt').transactions[0].schemeTitle);

    it('(c) by-name reuses null-ISIN scheme and backfills', async () => {
      const id = schemeRepo.createScheme({ schemeName: title() });
      const r = await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
      expect(r.schemesCreated).toEqual([]);
      expect(isinOf(id)).toBe(ISIN);
    });

    it('(d) by-name does not merge into a scheme holding a different ISIN', async () => {
      const id = schemeRepo.createScheme({ schemeName: title(), isin: 'INF000A00002' });
      const r = await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
      expect(isinOf(id)).toBe('INF000A00002');
      expect(r.schemesCreated).toHaveLength(1);
      const mine = schemeRepo.findByIsin(ISIN)!;
      expect(mine.id).not.toBe(id);
      expect(count(`SELECT count(*) c FROM investment_transactions WHERE scheme_id=${mine.id}`)).toBe(3);
    });

    it('(e) by-name with equal ISIN reuses (findByIsin path)', async () => {
      const id = schemeRepo.createScheme({ schemeName: title(), isin: ISIN });
      const r = await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
      expect(r.schemesCreated).toEqual([]);
      expect(schemeRepo.findByIsin(ISIN)!.id).toBe(id);
    });
  });

  describe('final review fixes', () => {
    const seedExited = (account: string, name: string, isin: string, date = '2024-01-01') => {
      const sid = schemeRepo.createScheme({ schemeName: name, isin });
      const mk = (type: 'PURCHASE' | 'REDEMPTION', d: string) => txRepo.insert({ schemeId: sid, schemeName: name, accountName: account, investmentApp: 'Groww', transactionType: type, units: 5, nav: 10, amount: 50, transactionDate: d });
      mk('PURCHASE', date); mk('REDEMPTION', '2024-01-02');
      return sid;
    };

    it('I2: name match with a conflicting AMFI code is not reused', async () => {
      const title = cleanSchemeTitle(fx('cas-single.txt').transactions[0].schemeTitle);
      const id = schemeRepo.createScheme({ schemeName: title, amfiCode: '111' });
      loadIsinIndex.mockResolvedValue(new Map([[ISIN, '222']]));
      const r = await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
      expect(r.schemesCreated).toHaveLength(1);
      expect(schemeRepo.getSchemeById(id)!.amfiCode).toBe('111');
      expect(schemeRepo.getSchemeById(id)!.isin).toBeNull();
      const mine = schemeRepo.findByIsin(ISIN)!;
      expect(mine.id).not.toBe(id);
      expect(mine.amfiCode).toBe('222');
    });

    it('I2: name match with null AMFI code still backfills code and ISIN', async () => {
      const title = cleanSchemeTitle(fx('cas-single.txt').transactions[0].schemeTitle);
      const id = schemeRepo.createScheme({ schemeName: title });
      loadIsinIndex.mockResolvedValue(new Map([[ISIN, '222']]));
      await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
      expect(schemeRepo.getSchemeById(id)!.amfiCode).toBe('222');
      expect(schemeRepo.getSchemeById(id)!.isin).toBe(ISIN);
    });

    it('I1: no warning when statement exited-fund count covers existing exited funds', async () => {
      seedExited('A', 'Gone One', 'INF000G00001');
      const data = { ...fx('cas-single.txt'), exitedIsinCount: 1 };
      const r = await importCas(deps(), { accountName: 'A', data });
      expect(r.importedCount).toBe(3);
    });

    it('I1: 409 dropped_history when existing exited funds exceed the statement; nothing written', async () => {
      seedExited('A', 'Gone One', 'INF000G00001');
      seedExited('A', 'Gone Two', 'INF000G00002');
      const before = count();
      const data = { ...fx('cas-single.txt'), exitedIsinCount: 1 };
      await expect(importCas(deps(), { accountName: 'A', data })).rejects.toMatchObject({
        statusCode: 409, code: 'dropped_history', message: expect.stringContaining('1 fully-exited fund'),
      });
      expect(count()).toBe(before);
      expect(count('SELECT count(*) c FROM investment_import_history')).toBe(0);
    });

    it('I1: passes with confirmDroppedHistory', async () => {
      seedExited('A', 'Gone One', 'INF000G00001');
      const r = await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt'), confirmDroppedHistory: true });
      expect(r.importedCount).toBe(3);
    });

    it('I1: ignores exited funds of other accounts and rows after periodEnd', async () => {
      seedExited('B', 'Gone B', 'INF000G00003');
      const r = await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
      expect(r.importedCount).toBe(3);
    });

    it('I3b: PAN already imported under another account label -> 409 pan_other_account unless confirmed', async () => {
      const data = fx('cas-single.txt');
      await importCas(deps(), { accountName: 'Primary', data: withPan(data, 'AAAAA1111A') });
      const before = count();
      await expect(importCas(deps(), { accountName: 'primary2', data: withPan(data, 'AAAAA1111A') }))
        .rejects.toMatchObject({ statusCode: 409, code: 'pan_other_account' });
      expect(count()).toBe(before);
      const ok = await importCas(deps(), { accountName: 'primary2', data: withPan(data, 'AAAAA1111A'), confirmPanChange: true });
      expect(ok.importedCount).toBe(3);
    });

    it('M2: panGuardReason distinguishes no_key from no_pan_in_statement', async () => {
      const data = fx('cas-single.txt');
      const a = await importCas(deps({ panHash: null }), { accountName: 'A', data: withPan(data, 'AAAAA1111A') });
      expect(a).toMatchObject({ panGuard: 'skipped', panGuardReason: 'no_key' });
      const b = await importCas(deps(), { accountName: 'B', data: withPan(data, null) });
      expect(b).toMatchObject({ panGuard: 'skipped', panGuardReason: 'no_pan_in_statement' });
      const c = await importCas(deps(), { accountName: 'C', data: withPan(data, 'CCCCC3333C') });
      expect(c.panGuard).toBe('checked');
      expect(c.panGuardReason).toBeUndefined();
    });
  });

  it('M2: empty statement throws 400 and deletes nothing', async () => {
    await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
    const empty: ParsedCasImport = { ...fx('cas-single.txt'), transactions: [] };
    await expect(importCas(deps(), { accountName: 'A', data: empty })).rejects.toMatchObject({ statusCode: 400 });
    expect(count()).toBe(3);
  });

  it('M1: statement without PAN vs stored hash needs confirmation; stores no hash', async () => {
    const data = fx('cas-single.txt');
    await importCas(deps(), { accountName: 'A', data: withPan(data, 'AAAAA1111A') });
    await expect(importCas(deps(), { accountName: 'A', data: withPan(data, null) }))
      .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('No PAN') });
    const r = await importCas(deps(), { accountName: 'A', data: withPan(data, null), confirmPanChange: true });
    expect(r.importedCount).toBe(3);
    expect(count('SELECT count(*) c FROM investment_import_history WHERE holder_pan IS NULL')).toBe(1);
    expect(historyRepo.latestCasPanHash('A')).toBe(hash('AAAAA1111A'));
    // next import with the original PAN still passes against the retained hash
    await importCas(deps(), { accountName: 'A', data: withPan(data, 'AAAAA1111A') });
  });

  it('M1: no stored hash + no PAN proceeds as skipped/checked-free', async () => {
    const r = await importCas(deps(), { accountName: 'A', data: withPan(fx('cas-single.txt'), null) });
    expect(r.panGuard).toBe('skipped');
  });

  it('M5: failure mid-insert rolls back deletes and history', async () => {
    const data = fx('cas-single.txt');
    await importCas(deps(), { accountName: 'A', data });
    const hist = count('SELECT count(*) c FROM investment_import_history');
    const bad = { ...data.transactions[0], transactionType: 'BOGUS' } as unknown as ParsedCasImport['transactions'][number];
    await expect(importCas(deps(), { accountName: 'A', data: { ...data, transactions: [data.transactions[0], bad] } })).rejects.toThrow();
    expect(count()).toBe(3);
    expect(count('SELECT count(*) c FROM investment_import_history')).toBe(hist);
  });

  describe('holdings snapshot supersede (fix round 2)', () => {
    const seedHoldings = (account: string, app: string) => {
      const sid = schemeRepo.createScheme({ schemeName: `H-${account}-${app}` });
      const hid = historyRepo.createInvestmentImport({ accountName: account, investmentApp: app, importType: 'holdings', startDate: '2026-03-31', endDate: '2026-03-31' });
      holdingsRepo.insert({ importHistoryId: hid, schemeId: sid, accountName: account, investmentApp: app, schemeName: 'h', folioNumber: null, units: 1, investedValue: 1, currentValue: 1, returnsAmount: 0, returnsXirr: null, asOfDate: '2026-03-31' });
    };
    const hc = (a: string) => count(`SELECT count(*) c FROM investment_holdings WHERE account_name='${a}'`);

    it('deletes every holdings row of the account (all apps), keeps other accounts', async () => {
      seedHoldings('A', 'Groww'); seedHoldings('A', 'Other'); seedHoldings('B', 'Groww');
      const r = await importCas(deps(), { accountName: 'A', data: fx('cas-single.txt') });
      expect(r.deletedHoldings).toBe(2);
      expect(hc('A')).toBe(0);
      expect(hc('B')).toBe(1);
    });

    it('mid-transaction failure rolls the holdings delete back', async () => {
      seedHoldings('A', 'Groww');
      const data = fx('cas-single.txt');
      const bad = { ...data.transactions[0], transactionType: 'BOGUS' } as unknown as ParsedCasImport['transactions'][number];
      await expect(importCas(deps(), { accountName: 'A', data: { ...data, transactions: [bad] } })).rejects.toThrow();
      expect(hc('A')).toBe(1);
    });
  });

  describe('scheme names (fix round 2)', () => {
    it('cleanSchemeTitle', () => {
      expect(cleanSchemeTitle('B 02 G - Test Elss Tax Saver Fund - ( ELSS U / S 80 C of IT ACT ) - Growth - Regular Plan ( Non - Demat )'))
        .toBe('Test Elss Tax Saver Fund - Growth - Regular Plan');
      expect(cleanSchemeTitle('128 TSDGG - Test Fund - Direct Growth')).toBe('Test Fund - Direct Growth');
      expect(cleanSchemeTitle('PP 001 ZG - Test Flexi Cap Fund - Direct Plan')).toBe('Test Flexi Cap Fund - Direct Plan');
      expect(cleanSchemeTitle('PPTSFGZ - Test ELSS Tax Saver Fund - Direct Plan')).toBe('Test ELSS Tax Saver Fund - Direct Plan');
      expect(cleanSchemeTitle('120 AFD 1 G - Test Arbitrage Fund - Direct Plan Growth ( Demat )')).toBe('Test Arbitrage Fund - Direct Plan Growth');
      const plain = 'NIPPON INDIA TEST SMALL CAP FUND - DIRECT GROWTH PLAN GROWTH OPTION';
      expect(cleanSchemeTitle(plain)).toBe(plain);
      expect(cleanSchemeTitle('Test Fund')).toBe('Test Fund');
    });

    it('stored scheme name is cleaned and every tx carries the scheme name', async () => {
      const data = fx('cas-single.txt');
      const dirty: ParsedCasImport = { ...data, transactions: data.transactions.map((t) => ({ ...t, schemeTitle: 'PP 001 ZG - Test Flexi Cap Fund - Direct Plan ( Demat )' })) };
      const r = await importCas(deps(), { accountName: 'A', data: dirty });
      expect(r.schemesCreated).toEqual(['Test Flexi Cap Fund - Direct Plan']);
      const names = sqlite.prepare('SELECT DISTINCT scheme_name n FROM investment_transactions').all() as { n: string }[];
      expect(names).toEqual([{ n: 'Test Flexi Cap Fund - Direct Plan' }]);
    });

    it('reused scheme: tx schemeName = scheme stored name; name match uses cleaned title', async () => {
      const id = schemeRepo.createScheme({ schemeName: 'Test Flexi Cap Fund - Direct Plan', amfiCode: '555' });
      const data = fx('cas-single.txt');
      const dirty: ParsedCasImport = { ...data, transactions: data.transactions.map((t) => ({ ...t, schemeTitle: 'PP 001 ZG - Test Flexi Cap Fund - Direct Plan' })) };
      const r = await importCas(deps(), { accountName: 'A', data: dirty });
      expect(r.schemesCreated).toEqual([]);
      expect(schemeRepo.findByIsin(ISIN)!.id).toBe(id);
      const names = sqlite.prepare('SELECT DISTINCT scheme_name n FROM investment_transactions').all() as { n: string }[];
      expect(names).toEqual([{ n: 'Test Flexi Cap Fund - Direct Plan' }]);
    });
  });
});
