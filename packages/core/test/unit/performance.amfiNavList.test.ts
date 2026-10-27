import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseAmfiDate, normalizeCategory, parseAmfiNavList, selectUniverse, isEquityTaxed, isElssCategory, buildIsinIndex,
} from '../../src/domain/performance/amfiNavList';
import { parseMfapiHistory } from '../../src/domain/performance/mfapi';

const text = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../fixtures/performance/NAVAll.sample.txt'), 'utf8');

describe('AMFI NAV list', () => {
  it('parses dates and normalises both header styles', () => {
    expect(parseAmfiDate('29-Sep-2026')).toBe('2026-09-29');
    expect(parseAmfiDate('garbage')).toBeNull();
    expect(normalizeCategory('Equity Scheme - Large Cap Fund')).toBe('Equity: Large Cap');
    expect(normalizeCategory('Equity Schemes - Large Cap Fund')).toBe('Equity: Large Cap');
    expect(normalizeCategory('Equity Schemes - ELSS- Tax Saver Fund')).toBe('Equity: ELSS');
    expect(normalizeCategory('Hybrid Scheme - Arbitrage Fund')).toBe('Hybrid: Arbitrage');
    expect(normalizeCategory('Other Scheme - Index Funds')).toBe('Other: Index Funds');
    expect(normalizeCategory('Income/Debt Oriented - Liquid Fund')).toBe('Debt: Liquid');
  });

  it('parses 8- and 6-field rows with AMC and category', () => {
    const rows = parseAmfiNavList(text);
    const axis = rows.find((r) => r.amfiCode === '120465')!;
    expect(axis).toMatchObject({ amc: 'Axis Mutual Fund', category: 'Equity: Large Cap', structure: 'open', nav: 66.54, navDate: '2026-09-29' });
    expect(axis.schemeName).toBe('Axis Large Cap Fund Direct Plan Growth Option');
    expect(rows.find((r) => r.amfiCode === '119544')!.category).toBe('Equity: ELSS');
    expect(rows.find((r) => r.amfiCode === '999003')!.structure).toBe('close');
  });

  it('M3: 6-field rows also read ISINs from fields 1 and 2 when present', () => {
    const txt = ['Open Ended Schemes(Equity Scheme - Large Cap Fund)', 'Test Mutual Fund',
      '555001;INF000T01011;INF000T01029;Test Large Cap Fund;12.5000;29-Sep-2026'].join('\n');
    const [r] = parseAmfiNavList(txt);
    expect(r).toMatchObject({ amfiCode: '555001', isinGrowth: 'INF000T01011', isinReinvest: 'INF000T01029' });
  });

  it('selects only open-ended Direct-Growth non-ETF non-segregated funds', () => {
    const codes = selectUniverse(parseAmfiNavList(text)).map((r) => r.amfiCode).sort();
    expect(codes).toEqual(['119544', '120401', '120465']);
  });

  it('returns no rows for an HTML error page', () => {
    expect(selectUniverse(parseAmfiNavList('<html><body>Service Unavailable</body></html>'))).toEqual([]);
  });

  it('classifies tax regime by category', () => {
    expect(isEquityTaxed('Equity: Small Cap')).toBe(true);
    expect(isEquityTaxed('Hybrid: Arbitrage')).toBe(true);
    expect(isEquityTaxed('Debt: Liquid')).toBe(false);
    expect(isElssCategory('Equity: ELSS')).toBe(true);
  });
});

describe('ISIN index', () => {
  const frag = [
    'Open Ended Schemes(Equity Scheme - Large Cap Fund)',
    'Test Mutual Fund',
    '500001;INF000A01AA1;INF000A01AA2;Test Large Cap Fund Direct Plan;Direct;Growth;10.5;29-Sep-2026',
    '500002;INF000A01BB1;-;Test Mid Cap Fund Direct Plan;Direct;Growth;20.5;29-Sep-2026',
    '500003;INF000A01EE1;INF000A01EE2;Test Legacy Fund;11.5;29-Sep-2026',
    '500004;INF000A01AA1;INF000A01CC2;Test Dup Fund Direct Plan;Direct;Growth;30.5;29-Sep-2026',
    '500005; inf000a01dd1 ;;Test Padded Fund Direct Plan;Direct;Growth;40.5;29-Sep-2026',
  ].join('\n');

  it('captures ISINs on rows, null for dash/empty; 6-field lines carry ISINs too (M3)', () => {
    const rows = parseAmfiNavList(frag);
    const by = (c: string) => rows.find((r) => r.amfiCode === c)!;
    expect(by('500001')).toMatchObject({ isinGrowth: 'INF000A01AA1', isinReinvest: 'INF000A01AA2' });
    expect(by('500002')).toMatchObject({ isinGrowth: 'INF000A01BB1', isinReinvest: null });
    expect(by('500003')).toMatchObject({ isinGrowth: 'INF000A01EE1', isinReinvest: 'INF000A01EE2' });
    expect(by('500005')).toMatchObject({ isinGrowth: 'INF000A01DD1', isinReinvest: null });
  });

  it('indexes both ISINs, skips dashes, keeps first on duplicate, normalises case/space', () => {
    const idx = buildIsinIndex(parseAmfiNavList(frag));
    expect(idx.get('INF000A01AA1')).toBe('500001');
    expect(idx.get('INF000A01AA2')).toBe('500001');
    expect(idx.get('INF000A01BB1')).toBe('500002');
    expect(idx.get('INF000A01CC2')).toBe('500004');
    expect(idx.get('INF000A01DD1')).toBe('500005');
    expect(idx.has('-')).toBe(false);
    expect(idx.has('')).toBe(false);
    expect(idx.get('INF000A01EE2')).toBe('500003');
    expect(idx.size).toBe(7);
  });
});

describe('mfapi history', () => {
  it('parses, drops bad points and sorts ascending', () => {
    const json = { meta: {}, data: [
      { date: '02-01-2024', nav: '11.5' }, { date: '01-01-2024', nav: '11.0' }, { date: '03-01-2024', nav: 'N/A' },
    ] };
    expect(parseMfapiHistory(json)).toEqual([{ date: '2024-01-01', nav: 11 }, { date: '2024-01-02', nav: 11.5 }]);
    expect(parseMfapiHistory({})).toEqual([]);
  });
});
