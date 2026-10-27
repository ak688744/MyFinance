import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCasText, CasParseError } from '../../src/import/casParser';

const DIR = join(__dirname, '..', 'fixtures', 'cas');
const load = (n: string) => readFileSync(join(DIR, `${n}.txt`), 'utf8');

describe('parseCasText', () => {
  it('parses cas-single', () => {
    const cas = parseCasText(load('cas-single'));
    expect(cas.periodStart).toBe('2018-01-01');
    expect(cas.periodEnd).toBe('2026-10-26');
    expect(cas.amcSummary).toEqual([{ amc: 'Nova Mutual Fund', cost: 15000, market: 18199.09 }]);
    expect(cas.folios).toHaveLength(1);
    const f = cas.folios[0];
    expect(f.amc).toBe('Nova Mutual Fund');
    expect(f.schemeTitle).toBe('NV01 - Nova Bluechip Fund - Direct Growth');
    expect(f.isin).toBe('INF123A01012');
    expect(f.demat).toBe(false);
    expect(f.folio).toBe('1234567 / 1');
    expect(f.openingUnits).toBe(0);
    expect(f.closingUnits).toBe(1299.935);
    expect(f.totalCost).toBe(15000);
    expect(f.rows).toHaveLength(6);
    expect(f.rows[0]).toMatchObject({ date: '2024-01-05', amount: 4999.75, nav: 10, units: 499.975, unitBalance: 499.975 });
    expect(f.rows[0].description).toBe('Systematic Investment New Purchase with SIP (1)');
    expect(f.rows[1]).toMatchObject({ date: '2024-01-05', amount: 0.25, nav: null, units: null, unitBalance: null });
    expect(f.rows[1].description).toContain('Stamp Duty');
    expect(f.rows.every((r) => r.line > 0)).toBe(true);
  });

  it('parses two folios with the same ISIN', () => {
    const cas = parseCasText(load('cas-two-folios-same-isin'));
    expect(cas.folios).toHaveLength(2);
    expect(cas.folios[0].isin).toBe(cas.folios[1].isin);
    expect(cas.folios[0].demat).toBe(false);
    expect(cas.folios[1].demat).toBe(true);
    expect(cas.folios[1].folio).toBe('7654321');
    expect(cas.folios[1].amc).toBe('Nova Mutual Fund');
  });

  it('parses zero-balance and segregated folios across a page break', () => {
    const cas = parseCasText(load('cas-zero-balance-and-segregated'));
    expect(cas.folios).toHaveLength(3);
    expect(cas.amcSummary).toHaveLength(2);
    const orbit = cas.folios[1];
    expect(orbit.closingUnits).toBe(0);
    expect(orbit.isin).toBe('INF456B01AB3');
    expect(orbit.rows[2].amount).toBe(-1000);
    expect(orbit.rows[2].units).toBe(-66.667);
    const seg = cas.folios[2];
    expect(seg.isin).toBe('INF456B01VK0');
    expect(seg.amc).toBe('Orbit Mutual Fund');
    expect(seg.schemeTitle).toContain('Segregated Portfolio 1');
    expect(seg.rows[0]).toMatchObject({ amount: null, nav: null, units: 100, unitBalance: 100 });
    expect(seg.rows[2]).toMatchObject({ amount: -140, nav: 1.4, units: -100, unitBalance: 250.5 });
    // wrapped noise row after the page break is one row, no units
    const last = seg.rows[seg.rows.length - 1];
    expect(last.date).toBe('2022-12-28');
    expect(last.units).toBeNull();
    expect(last.description).toContain('rounding off the NAV to 4 decimals');
    expect(seg.closingUnits).toBe(0);
  });

  it('joins wrapped rows and keeps noise rows', () => {
    const cas = parseCasText(load('cas-redemption-reversal'));
    const f = cas.folios[0];
    expect(f.isin).toBe('INF789C01234');
    expect(f.schemeTitle).toBe('NV07 - Nova Flexi Fund - Direct Growth');
    const rev = f.rows.find((r) => r.description.includes('Reversal'))!;
    expect(rev.description).toContain('not realised ) - Instalment No 2');
    expect(rev.unitBalance).toBe(100);
    expect(rev.units).toBe(-100);
    const red = f.rows.find((r) => r.description.startsWith('Redemption Directly'))!;
    expect(red.description.endsWith('less TDS, STT')).toBe(true);
    expect(red.unitBalance).toBe(155);
    expect(f.rows.filter((r) => r.units === null).length).toBe(5);
    expect(f.closingUnits).toBe(145);
  });

  it('parses structurally valid corrupt fixtures', () => {
    expect(() => parseCasText(load('cas-unknown-row'))).not.toThrow();
    const bad = parseCasText(load('cas-bad-balance'));
    expect(bad.folios[0].rows[2].unitBalance).toBe(900.955);
    expect(parseCasText(load('cas-nonzero-opening')).folios[0].openingUnits).toBe(100);
  });

  it('throws without the statement header', () => {
    expect(() => parseCasText('hello\nworld')).toThrow(CasParseError);
  });

  it('throws naming the folio when closing balance is missing', () => {
    const text = load('cas-single').replace(/^Closing Unit Balance.*$/m, '');
    try {
      parseCasText(text);
      throw new Error('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(CasParseError);
      expect((e as CasParseError).issues.join('\n')).toContain('1234567 / 1');
      expect((e as CasParseError).issues.join('\n')).toContain('Closing Unit Balance');
    }
  });

  it('throws on missing opening balance and missing ISIN', () => {
    expect(() => parseCasText(load('cas-single').replace(/^Opening Unit Balance.*$/m, ''))).toThrow(/Opening Unit Balance/);
    expect(() => parseCasText(load('cas-single').replace(/ISIN :\s+INF 123 A 01012/, ''))).toThrow(/ISIN/);
  });

  it('throws on an unrecognisable line inside a block, naming folio and line', () => {
    const text = load('cas-single').replace('05-Feb-2024   4,999.75', 'mystery garbage line\n05-Feb-2024   4,999.75');
    try {
      parseCasText(text);
      throw new Error('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(CasParseError);
      const msg = (e as CasParseError).issues[0];
      expect(msg).toContain('1234567 / 1');
      expect(msg).toContain('line 3');
      expect(msg).not.toContain('mystery');
      expect(msg).not.toContain('garbage');
    }
  });

  it('never echoes raw line text in error messages', () => {
    const text = load('cas-single').replace('NAV on 23-Oct-2026', 'JOHN SMITH 12 Main Road 9.50\nNAV on 23-Oct-2026');
    expect(() => parseCasText(text)).toThrow(CasParseError);
    try { parseCasText(text); } catch (e) {
      const m = (e as CasParseError).issues.join('\n');
      expect(m).not.toMatch(/JOHN|SMITH|Main Road/);
    }
  });

  it('throws on a second ISIN header before a Folio line', () => {
    const dup = load('cas-single').replace(/^(NV01 - Nova.*)$/m, '$1\n$1');
    expect(() => parseCasText(dup)).toThrow(/Second ISIN header at line/);
  });

  it('throws when a scheme header buffers too many lines', () => {
    const junk = Array.from({ length: 8 }, (_, k) => `page footer ${k}`).join('\n');
    const text = load('cas-single').replace(/^(NV01 - Nova.*)$/m, `${junk}\n$1`);
    expect(() => parseCasText(text)).toThrow(/exceeds 6 lines/);
  });

  it('accepts date-less tail boilerplate with figures but still throws on a dated unparseable tail line', () => {
    const base = load('cas-single');
    const ok = base.replace(/^Entry Load.*$/m, 'Entry Load: Nil. Exit Load: Nil\nFootnote: INR 56.63 per unit\nLoad 0.25 % applies');
    expect(() => parseCasText(ok)).not.toThrow();
    const bad = base.replace(/^Entry Load.*$/m, 'Entry Load: Nil. Exit Load: Nil\n05-Apr-2024 unparseable tail line');
    expect(() => parseCasText(bad)).toThrow(/Unrecognised transaction row/);
  });

  it('throws when a wrapped row is still pending at the Closing line', () => {
    const text = load('cas-redemption-reversal').replace(/^155\.000$/m, '').replace(/^STT$/m, '');
    expect(() => parseCasText(text)).toThrow(/no unit balance/);
  });

  it('parses a negative parenthesised unit balance', () => {
    const text = load('cas-single').replace('899.955', '(899.955)');
    const r = parseCasText(text).folios[0].rows[2];
    expect(r.unitBalance).toBe(-899.955);
  });

  it('throws when the header is valid but no scheme blocks exist', () => {
    const hdr = 'Consolidated Account Statement\n01-Jan-2018 To 26-Oct-2026\nPORTFOLIO SUMMARY\n';
    expect(() => parseCasText(hdr)).toThrow(CasParseError);
    expect(() => parseCasText(hdr)).toThrow(/No scheme blocks found in the statement/);
  });
});
