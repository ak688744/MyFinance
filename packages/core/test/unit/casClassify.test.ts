import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCasText, type CasFolio, type CasRow } from '../../src/import/casParser';
import { classifyCasFolio } from '../../src/import/casClassify';

const DIR = join(__dirname, '..', 'fixtures', 'cas');
const folios = (n: string) => parseCasText(readFileSync(join(DIR, `${n}.txt`), 'utf8')).folios;

let line = 0;
const row = (p: Partial<CasRow> & { description: string }): CasRow => ({
  line: ++line, date: '2024-01-05', amount: null, nav: null, units: null, unitBalance: 1, ...p,
});
const folioOf = (rows: CasRow[]): CasFolio => ({
  amc: 'Nova Mutual Fund', schemeTitle: 'NV01 - Test', isin: 'INF123A01012', folio: '1234567',
  demat: false, openingUnits: 0, closingUnits: 0, totalCost: 0, rows,
});
const buy = (description: string, amount = 1000, units = 10, date = '2024-01-05') =>
  row({ description, amount, nav: amount / units, units, date });

describe('classifyCasFolio - fixtures', () => {
  it('cas-single: SIP purchases carry gross amount (row + stamp duty)', () => {
    const r = classifyCasFolio(folios('cas-single')[0]);
    expect(r.issues).toEqual([]);
    expect(r.transactions).toHaveLength(3);
    expect(r.transactions[0]).toMatchObject({
      transactionType: 'PURCHASE', amount: 5000, units: 499.975, nav: 10, transactionDate: '2024-01-05',
      isin: 'INF123A01012', folio: '1234567 / 1',
    });
    expect(r.transactions.map((t) => t.amount)).toEqual([5000, 5000, 5000]);
  });

  it('cas-redemption-reversal: reversal and rejection drop their purchases; redemptions positive', () => {
    const r = classifyCasFolio(folios('cas-redemption-reversal')[0]);
    expect(r.issues).toEqual([]);
    expect(r.transactions.map((t) => [t.transactionType, t.amount, t.units, t.transactionDate])).toEqual([
      ['PURCHASE', 5000, 100, '2024-01-05'],
      ['PURCHASE', 5000, 80, '2024-04-05'],
      ['PURCHASE', 5000, 100, '2024-05-05'],
      ['REDEMPTION', 8750, 125, '2025-06-05'],
      ['REDEMPTION', 700, 10, '2025-09-10'],
    ]);
    const bought = r.transactions.filter((t) => t.transactionType === 'PURCHASE').reduce((a, t) => a + t.units, 0);
    expect(bought - 135).toBeCloseTo(folios('cas-redemption-reversal')[0].closingUnits, 3);
  });

  it('segregated creation is a zero-cost PURCHASE; units extinguished is a REDEMPTION', () => {
    const fs = folios('cas-zero-balance-and-segregated');
    const seg = classifyCasFolio(fs[2]);
    expect(seg.issues).toEqual([]);
    expect(seg.transactions.map((t) => [t.transactionType, t.units, t.nav, t.amount])).toEqual([
      ['PURCHASE', 100, 0, 0],
      ['PURCHASE', 250.5, 0, 0],
      ['REDEMPTION', 100, 1.4, 140],
      ['REDEMPTION', 250.5, 1.4, 350.7],
    ]);
    const full = classifyCasFolio(fs[1]);
    expect(full.issues).toEqual([]);
    expect(full.transactions[0]).toMatchObject({ transactionType: 'PURCHASE', amount: 100000, units: 7691.923 });
    expect(full.transactions[2]).toMatchObject({ transactionType: 'REDEMPTION', amount: 122004.1, units: 7625.256 });
  });

  it('cas-unknown-row: Switch In becomes an issue with folio and line, no raw text', () => {
    const f = folios('cas-unknown-row')[0];
    const r = classifyCasFolio(f);
    expect(r.issues).toHaveLength(1);
    const sw = f.rows.find((x) => /Switch/.test(x.description))!;
    expect(r.issues[0]).toContain(`line ${sw.line}`);
    expect(r.issues[0]).toContain(f.folio);
    expect(r.issues[0]).not.toMatch(/Switch/);
    expect(r.issues[0]).not.toContain('From Other Scheme');
  });
});

describe('classifyCasFolio - rules', () => {
  it.each([
    'Systematic Investment (1)', 'Sys. Investment (3/1000)', 'CSIP Purchase', 'CSIP Purchase Instalment No - 2/12',
    'Purchase - Systematic-BSE - Instalment No - 7', 'Purchase-BSE -', 'New Purchase', 'Purchase',
    'Systematic Investment New Purchase with SIP (1)', 'Sys. Investment Existing Folio with SIP (2/12)',
    'Purchase Systematic-BSE - Instalment No - 3/12',
  ])('purchase variant "%s" is a PURCHASE', (d) => {
    const r = classifyCasFolio(folioOf([buy(d)]));
    expect(r.issues).toEqual([]);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]).toMatchObject({ transactionType: 'PURCHASE', amount: 1000, units: 10, nav: 100 });
  });

  it.each([
    'Redemption', 'Redemption Of Units', 'Redemption less TDS, STT',
    'Redemption Directly credited to your Bank account (DC-BSE) less TDS, STT',
    '*Redemption(NEFT TEST BANK)-BSE - , less STT', 'Redemption - EXCHANGE PAYOUT , less STT',
  ])('redemption variant "%s" is a REDEMPTION with positive amount/units', (d) => {
    const r = classifyCasFolio(folioOf([row({ description: d, amount: -500, nav: 50, units: -10 })]));
    expect(r.issues).toEqual([]);
    expect(r.transactions[0]).toMatchObject({ transactionType: 'REDEMPTION', amount: 500, units: 10, nav: 50 });
  });

  it('adds same-date stamp duty to the gross amount', () => {
    const r = classifyCasFolio(folioOf([
      buy('Systematic Investment (1)', 4999.75, 499.975),
      row({ description: '*** Stamp Duty ***', amount: 0.25 }),
    ]));
    expect(r.transactions[0].amount).toBe(5000);
    expect(r.transactions[0].units).toBe(499.975);
  });

  it('reversal drops its purchase (and itself); the earlier equal purchase is kept when only one is reversed', () => {
    const r = classifyCasFolio(folioOf([
      buy('Purchase', 1000, 10, '2024-01-05'),
      buy('Purchase', 1000, 10, '2024-02-05'),
      row({ description: 'Purchase - Systematic-BSE - (Reversal) - Instalment No 3', amount: -1000, nav: 100, units: -10, date: '2024-02-05' }),
    ]));
    expect(r.issues).toEqual([]);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].transactionDate).toBe('2024-01-05');
  });

  it('rejection cancels the purchase and a reversed purchase drops its stamp duty too', () => {
    const r = classifyCasFolio(folioOf([
      buy('Sys. Investment (3/1000)', 999.75, 10),
      row({ description: '*** Stamp Duty ***', amount: 0.25 }),
      row({ description: 'Systematic Investment Rejection (/)', amount: -999.75, nav: 99.975, units: -10 }),
    ]));
    expect(r.issues).toEqual([]);
    expect(r.transactions).toEqual([]);
  });

  it('two identical same-day purchases both survive', () => {
    const r = classifyCasFolio(folioOf([buy('Purchase'), buy('Purchase')]));
    expect(r.transactions).toHaveLength(2);
  });

  it('reversal without a matching purchase is an issue', () => {
    const rv = row({ description: 'Purchase - (Reversal)', amount: -1000, nav: 100, units: -10 });
    const r = classifyCasFolio(folioOf([buy('Purchase', 2000, 20), rv]));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain(`line ${rv.line}`);
    expect(r.transactions).toHaveLength(1);
  });

  it('stamp duty with no preceding same-date purchase is an issue', () => {
    const sd = row({ description: '*** Stamp Duty ***', amount: 0.25, date: '2024-03-01' });
    const r = classifyCasFolio(folioOf([buy('Purchase'), sd]));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain(`line ${sd.line}`);
  });

  it('ignores known noise rows', () => {
    const r = classifyCasFolio(folioOf([
      row({ description: '***Change / Regn of Nominee***' }),
      row({ description: '***Cancelled***' }),
      row({ description: '*** STT Paid ***', amount: 0.44 }),
      row({ description: '***Refund Primary KYC ON HOLD ***', amount: 100 }),
    ]));
    expect(r).toEqual({ transactions: [], issues: [] });
  });

  it('unknown descriptions are issues with a redacted shape, even with a positive amount', () => {
    const odd = buy('Dividend Payout Secret Words 123');
    const r = classifyCasFolio(folioOf([odd]));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain(`line ${odd.line}`);
    expect(r.issues[0]).not.toContain('Secret');
    expect(r.transactions).toEqual([]);
  });

  it.each(['Switch-In Purchase', 'Switch In - Purchase from Other Scheme', 'Dividend Reinvestment', 'Transfer In', 'Purchased',
    'Purchase - Dividend Reinvest', 'Systematic Investment STP In'])(
    'non-purchase shape "%s" is an issue and yields no transaction', (d) => {
      const x = buy(d);
      const r = classifyCasFolio(folioOf([x]));
      expect(r.transactions).toEqual([]);
      expect(r.issues).toHaveLength(1);
      expect(r.issues[0]).toContain(`line ${x.line}`);
      expect(r.issues[0]).not.toMatch(/Switch|Dividend|Transfer|Purchased/);
    });

  it('interleaved P1,S1,P2,S2 with different amounts attach to the right purchase', () => {
    const r = classifyCasFolio(folioOf([
      buy('Purchase', 999.75, 10), row({ description: '*** Stamp Duty ***', amount: 0.25 }),
      buy('Purchase', 4999.5, 50), row({ description: '*** Stamp Duty ***', amount: 0.5 }),
    ]));
    expect(r.issues).toEqual([]);
    expect(r.transactions.map((t) => t.amount)).toEqual([1000, 5000]);
  });

  it('non-interleaved P1,P2,S1,S2 is never silently swapped: issues, amounts stay net', () => {
    const r = classifyCasFolio(folioOf([
      buy('Purchase', 999.75, 10), buy('Purchase', 4999.5, 50),
      row({ description: '*** Stamp Duty ***', amount: 0.25 }), row({ description: '*** Stamp Duty ***', amount: 0.5 }),
    ]));
    expect(r.issues).toHaveLength(2);
    expect(r.transactions.map((t) => t.amount)).toEqual([999.75, 4999.5]);
  });

  it('stamp duty after a redemption is an issue', () => {
    const sd = row({ description: '*** Stamp Duty ***', amount: 0.25 });
    const r = classifyCasFolio(folioOf([row({ description: 'Redemption', amount: -500, nav: 50, units: -10 }), sd]));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain(`line ${sd.line}`);
  });

  it('stamp duty trailing a flagged row never attaches to an earlier purchase', () => {
    const r = classifyCasFolio(folioOf([
      buy('Purchase', 1000, 10), buy('Switch In - X', 500, 5),
      row({ description: '*** Stamp Duty ***', amount: 0.25 }),
    ]));
    expect(r.issues).toHaveLength(1);
    expect(r.transactions[0].amount).toBe(1000);
  });

  it('redemption without a NAV is an issue', () => {
    const x = row({ description: 'Redemption', amount: -500, units: -10 });
    const r = classifyCasFolio(folioOf([x]));
    expect(r.transactions).toEqual([]);
    expect(r.issues[0]).toContain(`line ${x.line}`);
  });

  it('segregated creation carrying an amount is an issue', () => {
    const x = row({ description: 'Creation of units - Segregated Portfolio', amount: 10, units: 100 });
    const r = classifyCasFolio(folioOf([x]));
    expect(r.transactions).toEqual([]);
    expect(r.issues[0]).toContain(`line ${x.line}`);
  });

  const sd = (amount: number, date = '2024-01-05') => row({ description: '*** Stamp Duty ***', amount, date });
  const neg = (description: string, amount = 1000, units = 10, date = '2024-01-05') =>
    row({ description, amount: -amount, nav: amount / units, units: -units, date });

  it.each([
    'Systematic Purchase (Continuous Offer) Instalment No - 3/600', 'Purchase (Continuous Offer)',
    'Purchase- Systematic Instalment No - 46/601-Channel', 'Purchase - SIP Instalment No - 12/600 Distributor/ETMEOP - CAT-1-EOP-0002',
    'Purchase Distributor/ETMEOP - CAT-1-EOP-0002', 'Purchase - CAT-1-EOP-0002', 'Additional Purchase',
  ])('Kotak wording "%s" is a PURCHASE', (d) => {
    const r = classifyCasFolio(folioOf([buy(d, 999.95, 10), sd(0.05)]));
    expect(r.issues).toEqual([]);
    expect(r.transactions.map((t) => t.amount)).toEqual([1000]);
  });

  it('forward pair N, negative stamp, P, stamp is fully dropped', () => {
    const r = classifyCasFolio(folioOf([
      neg('Systematic Purchase (Continuous Offer)Credit Not Recd - HV trxns rejected - Instalment No 28', 999.9, 10),
      sd(-0.1), buy('Purchase (Continuous Offer) Instalment No - 6/600', 999.9, 10), sd(0.1),
    ]));
    expect(r).toEqual({ transactions: [], issues: [] });
  });

  it('reverse pair P, stamp, N, negative stamp is fully dropped; others survive', () => {
    const r = classifyCasFolio(folioOf([
      buy('Purchase', 500, 5, '2024-01-01'),
      buy('Systematic Purchase (Continuous Offer)', 999.9, 10), sd(0.1),
      neg('Purchase - SIPAccount Balance is insufficient Distributor/KJJEGANA - CAT-1-EOP-0002', 999.9, 10), sd(-0.1),
    ]));
    expect(r.issues).toEqual([]);
    expect(r.transactions.map((t) => t.amount)).toEqual([500]);
  });

  it('two identical SIPs plus a cancelled pair: exactly one purchase remains, with its own stamp', () => {
    const p = () => [buy('Systematic Purchase (Continuous Offer)', 999.9, 10), sd(0.1)];
    const r = classifyCasFolio(folioOf([...p(), ...p(), neg('Purchase - SIPAccount Balance is insufficient', 999.9, 10), sd(-0.1)]));
    expect(r.issues).toEqual([]);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]).toMatchObject({ amount: 1000, transactionDate: '2024-01-05' });
  });

  it('forward duplicate N, neg stamp, P1, stamp, P2, stamp: one survives with its own stamp', () => {
    const p = () => [buy('Purchase (Continuous Offer)', 999.9, 10), sd(0.1)];
    const r = classifyCasFolio(folioOf([neg('Purchase - SIPAccount Balance is insufficient', 999.9, 10), sd(-0.1), ...p(), ...p()]));
    expect(r.issues).toEqual([]);
    expect(r.transactions.map((t) => t.amount)).toEqual([1000]);
  });

  it('prefers the same-date partner over an earlier identical purchase (surviving dates)', () => {
    const r = classifyCasFolio(folioOf([
      buy('Purchase', 999.9, 10, '2024-01-05'), sd(0.1, '2024-01-05'),
      neg('Purchase - SIPAccount Balance is insufficient', 999.9, 10, '2024-02-05'), sd(-0.1, '2024-02-05'),
      buy('Purchase', 999.9, 10, '2024-02-05'), sd(0.1, '2024-02-05'),
    ]));
    expect(r.issues).toEqual([]);
    expect(r.transactions.map((t) => [t.transactionDate, t.amount])).toEqual([['2024-01-05', 1000]]);
  });

  it('pending cancellation left at a date change yields one redacted issue', () => {
    const x = neg('Purchase - SIPAccount Balance is insufficient SECRETBANK', 999.9, 10, '2024-02-05');
    const r = classifyCasFolio(folioOf([x, sd(-0.1, '2024-02-05'), buy('Purchase', 500, 5, '2024-03-05'), buy('Purchase', 999.9, 10, '2024-04-05')]));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain(`line ${x.line}`);
    expect(r.issues[0]).not.toContain('SECRETBANK');
    expect(r.transactions).toHaveLength(2);
  });

  it('negative row with both Reversal and Redemption wording fails closed with an accurate message', () => {
    const x = neg('Redemption Reversal SECRETWORD');
    const r = classifyCasFolio(folioOf([x]));
    expect(r.transactions).toEqual([]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain('ambiguous reversal/redemption wording');
    expect(r.issues[0]).not.toContain('SECRETWORD');
  });

  it('unmatched pending cancellation is an issue without raw text', () => {
    const x = neg('Purchase - SIPAccount Balance is insufficient SECRETBANK', 999.9, 10);
    const r = classifyCasFolio(folioOf([x, sd(-0.1), buy('Purchase', 500, 5, '2024-02-05')]));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain(`line ${x.line}`);
    expect(r.issues[0]).not.toContain('SECRETBANK');
    const r2 = classifyCasFolio(folioOf([x]));
    expect(r2.issues).toHaveLength(1);
  });

  it('negative stamp without a preceding cancelling row is an issue', () => {
    const s = sd(-0.1);
    const r = classifyCasFolio(folioOf([buy('Purchase', 999.9, 10), s]));
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toContain(`line ${s.line}`);
  });

  it('deny guard still blocks a negative Switch-In Purchase; Redemption unaffected', () => {
    const r = classifyCasFolio(folioOf([neg('Switch-In Purchase'), row({ description: 'Redemption', amount: -500, nav: 50, units: -10, date: '2024-02-01' })]));
    expect(r.issues).toHaveLength(1);
    expect(r.transactions.map((t) => t.transactionType)).toEqual(['REDEMPTION']);
  });

  it('informational noise markers are ignored', () => {
    const r = classifyCasFolio(folioOf([
      row({ description: '***Invalid Purchase12-JAN-2026_(Reversal - Code 1241)***' }),
      row({ description: '***Updation of KYC***' }),
      row({ description: '******Address Updated from CVL Data******' }),
    ]));
    expect(r).toEqual({ transactions: [], issues: [] });
  });

  it('cas-kotak-style fixture classifies cleanly', () => {
    const r = classifyCasFolio(folios('cas-kotak-style')[0]);
    expect(r.issues).toEqual([]);
    expect(r.transactions).toHaveLength(15);
    expect(r.transactions.filter((t) => t.transactionType === 'PURCHASE').map((t) => t.amount).slice(0, 4)).toEqual([2000, 2000, 2000, 1000]);
  });
});
