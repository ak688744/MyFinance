/**
 * Generates tiny, PII-free .xls fixtures whose column layouts match the core
 * parsers' header-alias detection. Run once: `tsx test/fixtures/makeFixtures.ts`
 * from packages/api. The emitted .xls files are committed.
 */
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function writeSheet(rows: (string | number)[][], file: string): void {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, join(here, file), { bookType: 'xls' });
}

// --- HDFC expense statement ---
// hdfcParser needs: date, narration, chq/ref no, withdrawal amt (debit), deposit amt (credit), closing balance
// Date format: DD/MM/YYYY
writeSheet(
  [
    ['Date', 'Narration', 'Chq/Ref No', 'Withdrawal Amt', 'Deposit Amt', 'Closing Balance'],
    ['01/04/2026', 'UPI-SWIGGY-orderid', 'REF001', '250.00', '', '10000.00'],
    ['02/04/2026', 'UPI-SALARY CREDIT', 'REF002', '', '50000.00', '60000.00'],
    ['03/04/2026', 'UPI-AMAZON-shopping', 'REF003', '1200.50', '', '58799.50'],
  ],
  'hdfc-sample.xls',
);

// --- Groww holdings ---
// holdingsParser needs:
// - Row 0: "HOLDINGS AS ON 2026-05-23"
// - Rows 1-2: Name, PAN
// - Row 3: summary header (Total Investments, Current Value, ..., XIRR at index 4)
// - Row 4: summary values
// - Row 5: blank
// - Row 6: holdings header (scheme name, amc, category, sub category, folio no, units, invested value, current value, returns, xirr)
// - Rows 7+: holdings data
writeSheet(
  [
    ['HOLDINGS AS ON 2026-05-23'],
    ['Name', 'Test User'],
    ['PAN', 'AAAAA0000A'],
    ['Total Investments', 'Current Value', '', '', 'XIRR'],
    ['100000', '120000', '', '', '9.5%'],
    [],
    ['Scheme Name', 'AMC', 'Category', 'Sub Category', 'Folio No', 'Units', 'Invested Value', 'Current Value', 'Returns', 'XIRR'],
    ['Test Flexi Cap Fund', 'Test AMC', 'Equity', 'Flexi Cap', 'FOLIO001', '500.123', '40000', '48000', '8000', '7.1%'],
    ['Test Index Fund', 'Test AMC', 'Equity', 'Index', 'FOLIO002', '300.5', '60000', '72000', '12000', '10.2%'],
  ],
  'groww-holdings-sample.xls',
);

// --- Groww transactions ---
// transactionParser needs:
// - Rows 0-2: Name, PAN, Date Range (e.g., "Apr 01 2025 to Mar 31 2026")
// - Row 3: blank
// - Row 4: header (Scheme Name, Transaction Type, Units, NAV, Amount, Date)
// - Rows 5+: transaction data
// - Date format: "DD MMM YYYY" (e.g., "10 Apr 2025")
writeSheet(
  [
    ['Name', 'Test User'],
    ['PAN', 'AAAAA0000A'],
    ['Date Range', 'Apr 01 2025 to Mar 31 2026'],
    [],
    ['Scheme Name', 'Transaction Type', 'Units', 'NAV', 'Amount', 'Date'],
    ['Test Flexi Cap Fund', 'PURCHASE', '50.0', '100.0', '5,000', '10 Apr 2025'],
    ['Test Flexi Cap Fund', 'PURCHASE', '48.0', '104.0', '5,000', '10 May 2025'],
    ['Test Index Fund', 'PURCHASE', '60.0', '100.0', '6,000', '10 Apr 2025'],
  ],
  'groww-transactions-sample.xls',
);

console.log('Fixtures written to', here);
