import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildCasImport } from '@myfinance/core';
import { makeDefaultIsinIndexLoader } from '../src/routes/imports';
import { buildTestServer, multipartPayload, seedInvestments } from './helpers';
import { makeLinesPdf, makeSimplePdf, makeItemsPdf } from './fixtures/makePdf';

const casDir = join(dirname(fileURLToPath(import.meta.url)), '../../core/test/fixtures/cas');
const casText = (name: string) => readFileSync(join(casDir, name), 'utf8');
const toLines = (t: string) => t.split('\n');

const stubIndex = async () => new Map<string, string>();
const KEY = 'b'.repeat(64);

let app: FastifyInstance;
let prevKey: string | undefined;
beforeEach(() => { prevKey = process.env.MYFINANCE_SECRET_KEY; });
afterEach(async () => {
  await app?.close();
  if (prevKey === undefined) delete process.env.MYFINANCE_SECRET_KEY; else process.env.MYFINANCE_SECRET_KEY = prevKey;
});

const upload = (pdf: ArrayBuffer, fields: Record<string, string> = { accountName: 'Main' }) => {
  const { payload, headers } = multipartPayload('file', 'cas.pdf', Buffer.from(pdf), fields);
  return app.inject({ method: 'POST', url: '/imports/investments/cas', payload, headers });
};
const casAccounts = () => (app.sqlite.prepare("SELECT COUNT(*) AS c FROM accounts WHERE institution = 'CAS'").get() as { c: number }).c;
const histCount = () => (app.sqlite.prepare('SELECT COUNT(*) AS c FROM investment_import_history').get() as { c: number }).c;
const txCount = () => (app.sqlite.prepare('SELECT COUNT(*) AS c FROM investment_transactions').get() as { c: number }).c;

describe('POST /imports/investments/cas', () => {
  it('imports a CAS PDF and is idempotent on re-upload', async () => {
    delete process.env.MYFINANCE_SECRET_KEY;
    app = await buildTestServer({ isinIndexLoader: stubIndex });
    const expected = buildCasImport(casText('cas-single.txt')).transactions.length;
    expect(expected).toBeGreaterThan(0);
    const pdf = makeLinesPdf(toLines(casText('cas-single.txt')));

    const r1 = await upload(pdf);
    expect(r1.statusCode).toBe(200);
    expect(r1.json().data.importedCount).toBe(expected);
    expect(r1.json().data.panGuard).toBe('skipped');
    expect(txCount()).toBe(expected);

    const r2 = await upload(pdf);
    expect(r2.statusCode).toBe(200);
    expect(r2.json().data.importedCount).toBe(expected);
    expect(txCount()).toBe(expected);

    const holdings = await app.inject({ method: 'GET', url: '/investments/holdings' });
    expect(holdings.statusCode).toBe(200);
    expect(holdings.json().data.length).toBeGreaterThan(0);
  });

  it('imports a password-protected PDF; missing/wrong password -> 400', async () => {
    app = await buildTestServer({ isinIndexLoader: stubIndex });
    const pdf = makeLinesPdf(toLines(casText('cas-single.txt')), { password: 'pw-test' });

    const none = await upload(pdf);
    expect(none.statusCode).toBe(400);
    expect(none.json().error.message).toMatch(/password required/i);

    const wrong = await upload(pdf, { accountName: 'Main', password: 'bad' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.message).toMatch(/incorrect/i);
    expect(txCount()).toBe(0);

    const ok = await upload(pdf, { accountName: 'Main', password: 'pw-test' });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).not.toContain('pw-test');
  });

  it('400 on a corrupt buffer and on a non-CAS PDF, with no writes', async () => {
    app = await buildTestServer({ isinIndexLoader: stubIndex });
    const junk = await upload(new TextEncoder().encode('not a pdf').buffer as ArrayBuffer);
    expect(junk.statusCode).toBe(400);
    expect(junk.json().error.message).toMatch(/could not read/i);

    const other = await upload(makeSimplePdf('SWIGGY 500'));
    expect(other.statusCode).toBe(400);
    expect(txCount()).toBe(0);
  });

  it('400 when accountName is missing', async () => {
    app = await buildTestServer({ isinIndexLoader: stubIndex });
    const r = await upload(makeLinesPdf(toLines(casText('cas-single.txt'))), {});
    expect(r.statusCode).toBe(400);
  });

  it.each(['cas-unknown-row.txt', 'cas-nonzero-opening.txt'])('%s -> 400 with issues and no writes', async (name) => {
    app = await buildTestServer({ isinIndexLoader: stubIndex });
    const r = await upload(makeLinesPdf(toLines(casText(name))));
    expect(r.statusCode).toBe(400);
    const err = r.json().error;
    expect(Array.isArray(err.issues)).toBe(true);
    expect(err.issues.length).toBeGreaterThan(0);
    expect(txCount()).toBe(0);
  });

  it('a 409 on the very first import leaves no account row', async () => {
    process.env.MYFINANCE_SECRET_KEY = KEY;
    app = await buildTestServer({ isinIndexLoader: stubIndex });
    const pdf = (pan: string) => makeLinesPdf(toLines(casText('cas-single.txt').replace('PAN: XXXXXXXXXX', `PAN: ${pan}`)));
    expect((await upload(pdf('ABCDE1234F'), { accountName: 'Other' })).statusCode).toBe(200);
    app.sqlite.prepare("DELETE FROM accounts WHERE institution = 'CAS'").run();
    const r = await upload(pdf('PQRST6789U'), { accountName: 'Other' });
    expect(r.statusCode).toBe(409);
    expect(casAccounts()).toBe(0);
  });

  it('password is passed verbatim (not trimmed)', async () => {
    app = await buildTestServer({ isinIndexLoader: stubIndex });
    const items = toLines(casText('cas-single.txt')).filter((l) => l.trim()).map((text, i) => ({ text, x: 20, y: 780 - i * 12 }));
    const pdf = makeItemsPdf([items.slice(0, 55), items.slice(55)].filter((p) => p.length), { password: ' pw x ' });
    // second page items need their own y range; reuse via makeLinesPdf-equivalent layout
    const ok = await upload(pdf, { accountName: 'Main', password: ' pw x ' });
    expect(ok.statusCode).toBe(200);
    const trimmed = await upload(pdf, { accountName: 'Main', password: 'pw x' });
    expect(trimmed.statusCode).toBe(400);
    expect(trimmed.json().error.message).toMatch(/incorrect/i);
  });

  it('unexpected errors are masked as a generic 500', async () => {
    app = await buildTestServer({ isinIndexLoader: stubIndex });
    app.repos.schemeRepo.findByIsin = () => { throw new Error('SENTINEL-SECRET-TEXT'); };
    const r = await upload(makeLinesPdf(toLines(casText('cas-single.txt'))));
    expect(r.statusCode).toBe(500);
    expect(r.body).not.toContain('SENTINEL-SECRET-TEXT');
    expect(r.json().error.message).toBe('CAS import failed');
  });

  it('PAN mismatch -> 409, then 200 with confirmPanChange=true', async () => {
    process.env.MYFINANCE_SECRET_KEY = KEY;
    app = await buildTestServer({ isinIndexLoader: stubIndex });
    const withPan = (pan: string) =>
      makeLinesPdf(toLines(casText('cas-single.txt').replace('PAN: XXXXXXXXXX', `PAN: ${pan}`)));

    const first = await upload(withPan('ABCDE1234F'));
    expect(first.statusCode).toBe(200);
    expect(first.json().data.panGuard).toBe('checked');

    const other = withPan('PQRST6789U');
    const txBefore = txCount();
    const histBefore = histCount();
    const mismatch = await upload(other);
    expect(mismatch.statusCode).toBe(409);
    expect(txCount()).toBe(txBefore);
    expect(histCount()).toBe(histBefore);
    expect(mismatch.body).not.toContain('PQRST6789U');

    const confirmed = await upload(other, { accountName: 'Main', confirmPanChange: 'true' });
    expect(confirmed.statusCode).toBe(200);
  });

  it('400 and no writes when the CAS header is present but there are no scheme blocks', async () => {
    app = await buildTestServer({ isinIndexLoader: stubIndex });
    const r = await upload(makeLinesPdf(['Consolidated Account Statement', '01-Jan-2018 To 26-Oct-2026', 'PORTFOLIO SUMMARY']));
    expect(r.statusCode).toBe(400);
    expect(r.json().error.issues.join(' ')).toMatch(/No scheme blocks/);
    expect(txCount()).toBe(0);
  });

  it('502 when the AMFI index loader fails; holdings unchanged', async () => {
    app = await buildTestServer({ isinIndexLoader: async () => { throw new Error('boom'); } });
    const r = await upload(makeLinesPdf(toLines(casText('cas-single.txt'))));
    expect(r.statusCode).toBe(502);
    expect(txCount()).toBe(0);
    expect(casAccounts()).toBe(0);
    const holdings = await app.inject({ method: 'GET', url: '/investments/holdings' });
    expect(holdings.json().data).toEqual([]);
  });

  it('CAS import supersedes the account\'s old holdings snapshot (no doubling)', async () => {
    app = await buildTestServer({ isinIndexLoader: stubIndex });
    seedInvestments(app, { accountName: 'Main', investmentApp: 'groww', holdings: true });
    const before = await app.inject({ method: 'GET', url: '/investments/holdings?account=Main' });
    expect(before.json().data.length).toBeGreaterThan(0);

    const r = await upload(makeLinesPdf(toLines(casText('cas-single.txt'))));
    expect(r.statusCode).toBe(200);
    expect(r.json().data.deletedHoldings).toBeGreaterThan(0);

    const after = await app.inject({ method: 'GET', url: '/investments/holdings?account=Main' });
    const rows = after.json().data as { investmentApp: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((h) => h.investmentApp === 'CAS')).toBe(true);
  });

  describe('final review fixes', () => {
    const accountNames = () => (app.sqlite.prepare('SELECT DISTINCT account_name n FROM investment_transactions ORDER BY n').all() as { n: string }[]).map((r) => r.n);
    const pdf = () => makeLinesPdf(toLines(casText('cas-single.txt')));
    const withPanPdf = (pan: string) => makeLinesPdf(toLines(casText('cas-single.txt').replace('PAN: XXXXXXXXXX', `PAN: ${pan}`)));

    it('I4: the uploaded filename is not persisted; history shows a constant', async () => {
      app = await buildTestServer({ isinIndexLoader: stubIndex });
      expect((await upload(pdf())).statusCode).toBe(200);
      const files = app.sqlite.prepare('SELECT file_name f FROM investment_import_history').all() as { f: string }[];
      expect(files.map((r) => r.f)).toEqual(['CAMS CAS']);
      const list = (await app.inject({ method: 'GET', url: '/imports' })).json().data as { sourceName: string }[];
      expect(JSON.stringify(list)).not.toContain('cas.pdf');
      expect(list.some((r) => r.sourceName === 'CAMS CAS')).toBe(true);
    });

    it('I3a: account name is canonicalised to the existing spelling (case/space-insensitive)', async () => {
      app = await buildTestServer({ isinIndexLoader: stubIndex });
      expect((await upload(pdf(), { accountName: 'Primary' })).statusCode).toBe(200);
      const r = await upload(pdf(), { accountName: ' primary ' });
      expect(r.statusCode).toBe(200);
      expect(r.json().data.deletedCount).toBeGreaterThan(0); // replaced the existing account's rows, not a new account
      expect(accountNames()).toEqual(['Primary']);
    });

    it('I3a: canonicalises against manual investment account labels too', async () => {
      app = await buildTestServer({ isinIndexLoader: stubIndex });
      app.repos.accountRepo.ensureAccount({ domain: 'investment', institution: 'Other', label: 'Joint' });
      expect((await upload(pdf(), { accountName: 'JOINT' })).statusCode).toBe(200);
      expect(accountNames()).toEqual(['Joint']);
    });

    it('I1: dropped exited-fund history -> 409 code dropped_history; confirmDroppedHistory continues', async () => {
      app = await buildTestServer({ isinIndexLoader: stubIndex });
      const sid = app.repos.schemeRepo.createScheme({ schemeName: 'Gone Fund', isin: 'INF000G00001' });
      for (const [type, d] of [['PURCHASE', '2024-01-01'], ['REDEMPTION', '2024-01-02']] as const)
        app.repos.txRepo.insert({ schemeId: sid, schemeName: 'Gone Fund', accountName: 'Main', investmentApp: 'Groww', transactionType: type, units: 5, nav: 10, amount: 50, transactionDate: d });
      const before = txCount();
      const r = await upload(pdf());
      expect(r.statusCode).toBe(409);
      expect(r.json().error.code).toBe('dropped_history');
      expect(txCount()).toBe(before);
      const ok = await upload(pdf(), { accountName: 'Main', confirmDroppedHistory: 'true' });
      expect(ok.statusCode).toBe(200);
    });

    it('I3b: same PAN under another account label -> 409 pan_other_account; confirmPanChange continues', async () => {
      process.env.MYFINANCE_SECRET_KEY = KEY;
      app = await buildTestServer({ isinIndexLoader: stubIndex });
      expect((await upload(withPanPdf('ABCDE1234F'), { accountName: 'Alpha' })).statusCode).toBe(200);
      const r = await upload(withPanPdf('ABCDE1234F'), { accountName: 'Beta' });
      expect(r.statusCode).toBe(409);
      expect(r.json().error.code).toBe('pan_other_account');
      expect(accountNames()).toEqual(['Alpha']);
      const ok = await upload(withPanPdf('ABCDE1234F'), { accountName: 'Beta', confirmPanChange: 'true' });
      expect(ok.statusCode).toBe(200);
    });

    it('M2: panGuardReason is passed through', async () => {
      delete process.env.MYFINANCE_SECRET_KEY;
      app = await buildTestServer({ isinIndexLoader: stubIndex });
      expect((await upload(pdf())).json().data.panGuardReason).toBe('no_key');
    });

    it('M5: an ensureAccount failure does not fail a committed import', async () => {
      app = await buildTestServer({ isinIndexLoader: stubIndex });
      app.repos.accountRepo.ensureAccount = () => { throw new Error('SENTINEL-ACCOUNT'); };
      const r = await upload(pdf());
      expect(r.statusCode).toBe(200);
      expect(r.body).not.toContain('SENTINEL-ACCOUNT');
      expect(txCount()).toBeGreaterThan(0);
    });

    it('M3: an empty AMFI index from the default loader is a 502, never silent null-code schemes', async () => {
      const loader = makeDefaultIsinIndexLoader(async () => '<html>Service Unavailable</html>');
      await expect(loader()).rejects.toThrow();
      app = await buildTestServer({ isinIndexLoader: loader });
      const r = await upload(pdf());
      expect(r.statusCode).toBe(502);
      expect(txCount()).toBe(0);
    });
  });
});
