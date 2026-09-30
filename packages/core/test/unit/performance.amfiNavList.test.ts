import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseAmfiDate, normalizeCategory, parseAmfiNavList, selectUniverse, isEquityTaxed, isElssCategory,
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

describe('mfapi history', () => {
  it('parses, drops bad points and sorts ascending', () => {
    const json = { meta: {}, data: [
      { date: '02-01-2024', nav: '11.5' }, { date: '01-01-2024', nav: '11.0' }, { date: '03-01-2024', nav: 'N/A' },
    ] };
    expect(parseMfapiHistory(json)).toEqual([{ date: '2024-01-01', nav: 11 }, { date: '2024-01-02', nav: 11.5 }]);
    expect(parseMfapiHistory({})).toEqual([]);
  });
});
