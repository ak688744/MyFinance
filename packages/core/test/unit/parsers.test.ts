import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseHdfcStatementXls } from '../../src/import/hdfcParser';
import { parseGrowwTransactionXls } from '../../src/import/transactionParser';
import { parseGrowwHoldingsXls } from '../../src/import/holdingsParser';

// ---------------------------------------------------------------------------
// Helpers: build an in-memory xlsx ArrayBuffer from an array-of-arrays sheet.
// ---------------------------------------------------------------------------
function buildXlsx(aoa: (string | number | null)[][]): ArrayBuffer {
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  // XLSX.write({type:'array'}) returns an ArrayBuffer ready for XLSX.read.
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// HDFC bank statement parser
// ---------------------------------------------------------------------------
describe('parseHdfcStatementXls', () => {
  it('parses debit and credit rows with dedupe keys and direction', () => {
    const buffer = buildXlsx([
      ['HDFC BANK', '', '', '', '', ''],
      ['Statement of account', '', '', '', '', ''],
      [
        'Date',
        'Narration',
        'Chq Ref No',
        'Value Dt',
        'Withdrawal Amt',
        'Deposit Amt',
        'Closing Balance',
      ],
      [
        '01/05/2026',
        'UPI-SWIGGY-9999@upi-PAY',
        'REF001',
        '01/05/2026',
        '250.50',
        '',
        '10000.00',
      ],
      [
        '02/05/2026',
        'SALARY CREDIT ACME CORP',
        'REF002',
        '02/05/2026',
        '',
        '50000',
        '60000.00',
      ],
    ]);

    const txns = parseHdfcStatementXls(buffer);

    expect(txns).toHaveLength(2);

    const debit = txns[0];
    expect(debit.transactionDate).toBe('2026-05-01');
    expect(debit.valueDate).toBe('2026-05-01');
    expect(debit.direction).toBe('debit');
    expect(debit.amount).toBeCloseTo(250.5, 2);
    expect(debit.balance).toBeCloseTo(10000, 2);
    expect(debit.referenceNumber).toBe('REF001');
    expect(debit.sourceType).toBe('xls');
    expect(typeof debit.dedupeKey).toBe('string');
    expect(debit.dedupeKey).toContain('2026-05-01');
    expect(debit.dedupeKey).toContain('debit');
    // merchant/upi extraction is wired through core categorize helper
    expect(debit).toHaveProperty('merchantKey');
    expect(debit).toHaveProperty('upiNoteKeyword');

    const credit = txns[1];
    expect(credit.direction).toBe('credit');
    expect(credit.amount).toBeCloseTo(50000, 2);
  });
});

// ---------------------------------------------------------------------------
// Groww mutual-fund transaction history parser
// ---------------------------------------------------------------------------
describe('parseGrowwTransactionXls', () => {
  it('parses PURCHASE rows with DD MMM YYYY dates and comma amounts', () => {
    const buffer = buildXlsx([
      ['Name', 'Jane Doe'],
      ['PAN', 'ABCDE1234F'],
      ['Date Range', 'Apr 01 2025 to Mar 31 2026'],
      [],
      ['Scheme Name', 'Transaction Type', 'Units', 'NAV', 'Amount', 'Date'],
      ['Some Fund Direct Growth', 'PURCHASE', '10.5', '100.2', '1,052', '06 May 2026'],
      ['Some Fund Direct Growth', 'PURCHASE', '5.25', '100.2', '525', '07 Jun 2026'],
    ]);

    const data = parseGrowwTransactionXls(buffer);

    expect(data.holderName).toBe('Jane Doe');
    expect(data.holderPan).toBe('ABCDE1234F');
    expect(data.startDate).toBe('2025-04-01');
    expect(data.endDate).toBe('2026-03-31');
    expect(data.transactions).toHaveLength(2);

    const first = data.transactions[0];
    expect(first.schemeName).toBe('Some Fund Direct Growth');
    expect(first.transactionType).toBe('PURCHASE');
    expect(first.units).toBeCloseTo(10.5, 4);
    expect(first.nav).toBeCloseTo(100.2, 4);
    expect(first.amount).toBeCloseTo(1052, 2);
    expect(first.transactionDate).toBe('2026-05-06');
  });
});

// ---------------------------------------------------------------------------
// Groww holdings export parser
// ---------------------------------------------------------------------------
describe('parseGrowwHoldingsXls', () => {
  it('parses holdings rows, summary and category mapping', () => {
    const buffer = buildXlsx([
      ['Name', 'Jane Doe'],
      ['PAN', 'ABCDE1234F'],
      ['Total Investments', '', '', '', ''],
      ['10,000', '12,000', '', '', '11.97%'],
      [],
      [
        'Scheme Name',
        'AMC',
        'Category',
        'Sub Category',
        'Folio No',
        'Units',
        'Invested Value',
        'Current Value',
        'Returns',
        'XIRR',
      ],
      [
        'Some Equity Fund Direct Growth',
        'Some AMC',
        'Equity',
        'Large Cap',
        'FOLIO123',
        '100.5',
        '10,000',
        '12,000',
        '2,000',
        '11.97%',
      ],
    ]);

    const data = parseGrowwHoldingsXls(buffer, 'Holdings_Statement_2026-04-04.xlsx');

    expect(data.asOfDate).toBe('2026-04-04');
    expect(data.summary.totalInvested).toBeCloseTo(10000, 2);
    expect(data.summary.totalCurrentValue).toBeCloseTo(12000, 2);
    expect(data.summary.totalXirr).toBeCloseTo(11.97, 2);
    expect(data.summary.holderName).toBe('Jane Doe');
    expect(data.summary.holderPan).toBe('ABCDE1234F');
    expect(data.holdings).toHaveLength(1);

    const holding = data.holdings[0];
    expect(holding.schemeName).toBe('Some Equity Fund Direct Growth');
    expect(holding.amcName).toBe('Some AMC');
    expect(holding.category).toBe('equity');
    expect(holding.subCategory).toBe('Large Cap');
    expect(holding.folioNumber).toBe('FOLIO123');
    expect(holding.units).toBeCloseTo(100.5, 4);
    expect(holding.investedValue).toBeCloseTo(10000, 2);
    expect(holding.currentValue).toBeCloseTo(12000, 2);
    expect(holding.returnsAmount).toBeCloseTo(2000, 2);
    expect(holding.returnsXirr).toBeCloseTo(11.97, 2);
  });
});
