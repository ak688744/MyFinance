import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCasImport, CasImportError } from '../../src/import/casReconcile';
import { parseCasText, CasParseError } from '../../src/import/casParser';

const DIR = join(__dirname, '..', 'fixtures', 'cas');
const fx = (n: string) => readFileSync(join(DIR, `${n}.txt`), 'utf8');
const issuesOf = (text: string): string[] => {
  try {
    buildCasImport(text);
  } catch (e) {
    expect(e).toBeInstanceOf(CasImportError);
    return (e as CasImportError).issues;
  }
  throw new Error('expected CasImportError');
};

describe('buildCasImport - good fixtures', () => {
  it.each([
    ['cas-single', 3],
    ['cas-two-folios-same-isin', 3],
    ['cas-zero-balance-and-segregated', 8],
    ['cas-redemption-reversal', 5],
    ['cas-kotak-style', 15],
  ])('%s builds with %i transactions', (name, count) => {
    const r = buildCasImport(fx(name));
    expect(r.transactions).toHaveLength(count);
    expect(r.periodStart).toBe('2018-01-01');
    expect(r.periodEnd).toBe('2026-10-26');
    expect(r.holderPan).toBeNull();
  });

  it('I1: exitedIsinCount counts distinct ISINs whose folios all close at zero', () => {
    expect(buildCasImport(fx('cas-single')).exitedIsinCount).toBe(0);
    expect(buildCasImport(fx('cas-zero-balance-and-segregated')).exitedIsinCount).toBeGreaterThanOrEqual(1);
  });

  it('two folios sharing an ISIN return transactions from both folios', () => {
    const r = buildCasImport(fx('cas-two-folios-same-isin'));
    expect(new Set(r.transactions.map((t) => t.folio)).size).toBe(2);
    expect(new Set(r.transactions.map((t) => t.isin)).size).toBe(1);
  });

  it('fully redeemed folio: stated cost 0, closing 0, net units 0, and the import passes', () => {
    const text = fx('cas-zero-balance-and-segregated');
    const f = parseCasText(text).folios.find((x) => x.folio === '2345678')!;
    expect(f.closingUnits).toBe(0);
    expect(f.totalCost).toBe(0);
    const r = buildCasImport(text);
    const mine = r.transactions.filter((t) => t.folio === '2345678');
    expect(mine.some((t) => t.transactionType === 'REDEMPTION')).toBe(true);
    const net = mine.reduce((s, t) => s + (t.transactionType === 'PURCHASE' ? t.units : -t.units), 0);
    expect(Math.abs(net)).toBeLessThan(0.001);
  });
});

describe('buildCasImport - failures', () => {
  it('cas-bad-balance: first issue names the folio and row line', () => {
    const issues = issuesOf(fx('cas-bad-balance'));
    expect(issues[0]).toBe(
      'Folio 1234567 / 1 (INF123A01012), line 33: running balance 899.955 does not match stated 900.955',
    );
  });

  it('cas-bad-balance reports only the balance issue, not a misleading closing-units issue', () => {
    expect(issuesOf(fx('cas-bad-balance'))).toHaveLength(1);
  });

  it('a CasParseError from the parser is converted to CasImportError with the same issues', () => {
    let parseIssues: string[] = [];
    try { parseCasText('garbage'); } catch (e) { expect(e).toBeInstanceOf(CasParseError); parseIssues = (e as CasParseError).issues; }
    expect(parseIssues.length).toBeGreaterThan(0);
    expect(issuesOf('garbage')).toEqual(parseIssues);
  });

  it('cas-unknown-row: classification issue is reported', () => {
    const issues = issuesOf(fx('cas-unknown-row'));
    expect(issues[0]).toMatch(/Folio 1234567 \/ 1 \(INF123A01012\), line 35: unrecognised row/);
  });

  it('cas-nonzero-opening: asks for a statement from inception', () => {
    const issues = issuesOf(fx('cas-nonzero-opening'));
    expect(issues.some((i) => /request a statement from inception \(include zero-balance folios\)/.test(i))).toBe(true);
  });

  it('truncates to 20 issues', () => {
    const text = fx('cas-unknown-row');
    const row = text.split('\n').find((l) => l.includes('Switch In'))!;
    const bloated = text.replace(row, Array(25).fill(row).join('\n'));
    const all = issuesOf(bloated);
    expect(all).toHaveLength(20);
    expect(all[0]).toMatch(/line 35: unrecognised row/);
  });

  it('stated folio cost off by more than Rs 1 fails; off by Rs 0.50 passes', () => {
    const text = fx('cas-single');
    expect(text).toContain('Total Cost Value: 15,000.00');
    expect(() => buildCasImport(text.replace('Total Cost Value: 15,000.00', 'Total Cost Value: 15,000.50'))).not.toThrow();
    const issues = issuesOf(text.replace('Total Cost Value: 15,000.00', 'Total Cost Value: 15,002.00'));
    expect(issues[0]).toBe('Folio 1234567 / 1 (INF123A01012): derived cost 15000.00 does not match stated Total Cost Value 15002.00');
  });

  it('per-AMC summary cost mismatch is reported', () => {
    const text = fx('cas-single').replace(/(Nova Mutual Fund\s+)15,000\.00/, '$115,010.00');
    const issues = issuesOf(text);
    expect(issues.some((i) => i.includes('AMC "Nova Mutual Fund": derived cost 15000.00 does not match portfolio summary 15010.00'))).toBe(true);
  });
});

// Build a single-folio statement from cas-single with custom rows.
function withRows(rows: string[], closing: string, cost: string): string {
  return fx('cas-single')
    .replace(/(Opening Unit Balance: 0\.000\n)[\s\S]*?(NAV on)/, `$1${rows.join('\n')}\n$2`)
    .replace('Closing Unit Balance: 1,299.935   Total Cost Value: 15,000.00', `Closing Unit Balance: ${closing}   Total Cost Value: ${cost}`)
    .replace(/Nova Mutual Fund {3}15,000\.00/, `Nova Mutual Fund   ${cost}`)
    .replace(/Total {3}15,000\.00/, `Total   ${cost}`);
}

describe('buildCasImport - FIFO keeps statement order for same-date lots', () => {
  it('two same-date purchases at different gross cost, then a partial redemption', () => {
    const text = withRows(
      [
        '05-Jan-2024   1,000.00   10.0000 100.000 Purchase   100.000',
        '05-Jan-2024   2,000.00   20.0000 100.000 Purchase   200.000',
        '10-Feb-2024   (1,500.00)   15.0000 (100.000) Redemption   100.000',
      ],
      '100.000',
      '2,000.00',
    );
    expect(buildCasImport(text).transactions).toHaveLength(3); // oldest (first) lot consumed -> 2,000 remains
    expect(issuesOf(text.replace(/Total Cost Value: 2,000\.00/, 'Total Cost Value: 1,000.00'))[0]).toMatch(/derived cost 2000\.00/);
  });

  it('same-date segregated creation + purchase, then partial redemption', () => {
    const text = withRows(
      [
        '05-Jan-2024   100.000 Creation of units - Segregated Portfolio   100.000',
        '05-Jan-2024   1,000.00   10.0000 100.000 Purchase   200.000',
        '05-Feb-2024   (500.00)   10.0000 (50.000) Redemption   150.000',
      ],
      '150.000',
      '1,000.00',
    );
    expect(buildCasImport(text).transactions).toHaveLength(3); // 50 segregated units (cost 0) consumed first
  });
});

describe('buildCasImport - AMC summary matching', () => {
  it('matches AMC names ignoring case and whitespace', () => {
    const text = fx('cas-single').replace(/Nova Mutual Fund {3}15,000\.00/, 'NOVA   mutual  FUND   15,000.00');
    expect(() => buildCasImport(text)).not.toThrow();
  });

  it('an AMC missing from the summary passes when its derived cost is 0', () => {
    const text = fx('cas-zero-balance-and-segregated').replace(/Orbit Mutual Fund {3}0\.00 {3}0\.00\n/, '');
    expect(text).not.toBe(fx('cas-zero-balance-and-segregated'));
    expect(() => buildCasImport(text)).not.toThrow();
  });

  it('an AMC missing from the summary fails when its derived cost is non-zero', () => {
    const text = fx('cas-single').replace(/Nova Mutual Fund {3}15,000\.00 {3}18,199\.09\n/, '');
    expect(issuesOf(text).some((i) => /not present in the portfolio summary/.test(i))).toBe(true);
  });
});

describe('buildCasImport empty statements', () => {
  it('rejects a statement with a valid header but no folios', () => {
    const hdr = 'Consolidated Account Statement\n01-Jan-2018 To 26-Oct-2026\n';
    expect(issuesOf(hdr).join(' ')).toMatch(/No scheme blocks found/);
  });
});
