import * as XLSX from 'xlsx';

/**
 * Groww Mutual Fund Transaction History Parser
 *
 * Parses Excel files exported from Groww's "Transaction History" feature.
 *
 * Expected Excel structure:
 * - Header section with: Name, Mobile Number, PAN, Date Range
 * - Data columns: Scheme Name, Transaction Type, Units, NAV, Amount, Date
 * - Date format: "DD MMM YYYY" (e.g., "10 Mar 2026")
 * - Amount format: with commas (e.g., "4,999")
 * - Transaction types: PURCHASE, REDEMPTION, SWITCH_IN, SWITCH_OUT, etc.
 */

export type TransactionType =
  | 'PURCHASE'
  | 'REDEMPTION'
  | 'SWITCH_IN'
  | 'SWITCH_OUT'
  | 'DIVIDEND';

export type ParsedMutualFundTransaction = {
  schemeName: string;
  transactionType: TransactionType;
  units: number;
  nav: number;
  amount: number;
  transactionDate: string; // YYYY-MM-DD format
};

export type ParsedTransactionData = {
  startDate: string; // YYYY-MM-DD format
  endDate: string; // YYYY-MM-DD format
  holderName?: string;
  holderPan?: string;
  transactions: ParsedMutualFundTransaction[];
};

type HeaderMap = Partial<Record<CanonicalColumn, number>>;

type CanonicalColumn =
  | 'schemeName'
  | 'transactionType'
  | 'units'
  | 'nav'
  | 'amount'
  | 'date';

const HEADER_ALIASES: Record<CanonicalColumn, string[]> = {
  schemeName: ['scheme name', 'fund name', 'scheme', 'fund'],
  transactionType: ['transaction type', 'type', 'txn type'],
  units: ['units', 'unit'],
  nav: ['nav', 'net asset value'],
  amount: ['amount', 'value', 'investment'],
  date: ['date', 'transaction date', 'txn date'],
};

const TRANSACTION_TYPE_MAPPING: Record<string, TransactionType> = {
  purchase: 'PURCHASE',
  buy: 'PURCHASE',
  invest: 'PURCHASE',
  investment: 'PURCHASE',
  redemption: 'REDEMPTION',
  redeem: 'REDEMPTION',
  sell: 'REDEMPTION',
  withdrawal: 'REDEMPTION',
  'switch in': 'SWITCH_IN',
  'switch-in': 'SWITCH_IN',
  switchin: 'SWITCH_IN',
  'switch out': 'SWITCH_OUT',
  'switch-out': 'SWITCH_OUT',
  switchout: 'SWITCH_OUT',
  dividend: 'DIVIDEND',
  'dividend payout': 'DIVIDEND',
  'dividend reinvestment': 'DIVIDEND',
};

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

export function parseGrowwTransactionXls(
  fileBuffer: ArrayBuffer
): ParsedTransactionData {
  const workbook = XLSX.read(fileBuffer, {
    type: 'array',
    cellDates: true,
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error('The workbook does not contain any sheets.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
    worksheet,
    {
      header: 1,
      blankrows: false,
      defval: '',
      raw: false,
    }
  );

  // Extract header information (Name, PAN, Date Range)
  const headerInfo = extractHeaderInfo(rows);

  // Find the data header row
  const headerRowIndex = findHeaderRowIndex(rows);

  if (headerRowIndex === -1) {
    throw new Error(
      'Could not detect a Groww transaction header row. Export the transaction history as Excel with table headers visible.'
    );
  }

  const headerMap = buildHeaderMap(rows[headerRowIndex] ?? []);

  if (
    headerMap.schemeName === undefined ||
    headerMap.date === undefined ||
    headerMap.amount === undefined
  ) {
    throw new Error(
      'The selected Excel file is missing required columns (Scheme Name, Date, or Amount).'
    );
  }

  const transactions: ParsedMutualFundTransaction[] = [];

  for (const row of rows.slice(headerRowIndex + 1)) {
    const transaction = parseTransactionRow(row ?? [], headerMap);

    if (transaction) {
      transactions.push(transaction);
    }
  }

  if (transactions.length === 0) {
    throw new Error(
      'No transaction rows were found in the selected Excel file.'
    );
  }

  // Determine date range from transactions if not found in header
  const { startDate, endDate } = determineDateRange(
    headerInfo.startDate,
    headerInfo.endDate,
    transactions
  );

  return {
    startDate,
    endDate,
    holderName: headerInfo.holderName,
    holderPan: headerInfo.holderPan,
    transactions,
  };
}

function extractHeaderInfo(rows: (string | number | Date | null)[][]) {
  let holderName: string | undefined;
  let holderPan: string | undefined;
  let startDate: string | undefined;
  let endDate: string | undefined;

  // Look in the first 15 rows for header information
  for (const row of rows.slice(0, 15)) {
    for (let i = 0; i < row.length; i++) {
      const cell = String(row[i] ?? '').trim();
      const nextCell = String(row[i + 1] ?? '').trim();

      // Extract Name
      if (cell.toLowerCase() === 'name' && nextCell) {
        holderName = nextCell;
      }

      // Extract PAN
      if (cell.toLowerCase() === 'pan' && nextCell) {
        holderPan = nextCell;
      }

      // Extract Date Range (e.g., "Apr 01 2025 to Mar 31 2026" or "Date Range: Apr 01 2025 to Mar 31 2026")
      const dateRangeMatch = cell.match(
        /(?:date\s*range\s*:?\s*)?(\w{3,9}\s+\d{1,2}\s+\d{4})\s+to\s+(\w{3,9}\s+\d{1,2}\s+\d{4})/i
      );
      if (dateRangeMatch) {
        const parsedStart = parseGrowwDate(dateRangeMatch[1]);
        const parsedEnd = parseGrowwDate(dateRangeMatch[2]);
        if (parsedStart) startDate = parsedStart;
        if (parsedEnd) endDate = parsedEnd;
      }

      // Also check next cell for date range
      if (cell.toLowerCase().includes('date range') && nextCell) {
        const nextDateRangeMatch = nextCell.match(
          /(\w{3,9}\s+\d{1,2}\s+\d{4})\s+to\s+(\w{3,9}\s+\d{1,2}\s+\d{4})/i
        );
        if (nextDateRangeMatch) {
          const parsedStart = parseGrowwDate(nextDateRangeMatch[1]);
          const parsedEnd = parseGrowwDate(nextDateRangeMatch[2]);
          if (parsedStart) startDate = parsedStart;
          if (parsedEnd) endDate = parsedEnd;
        }
      }
    }
  }

  return { holderName, holderPan, startDate, endDate };
}

function determineDateRange(
  headerStartDate: string | undefined,
  headerEndDate: string | undefined,
  transactions: ParsedMutualFundTransaction[]
): { startDate: string; endDate: string } {
  if (headerStartDate && headerEndDate) {
    return { startDate: headerStartDate, endDate: headerEndDate };
  }

  // Calculate from transactions
  const dates = transactions
    .map((t) => t.transactionDate)
    .filter((d) => d)
    .sort();

  if (dates.length === 0) {
    // Fallback to current date
    const today = new Date().toISOString().slice(0, 10);
    return { startDate: today, endDate: today };
  }

  return {
    startDate: headerStartDate ?? dates[0],
    endDate: headerEndDate ?? dates[dates.length - 1],
  };
}

function findHeaderRowIndex(rows: (string | number | Date | null)[][]) {
  let bestIndex = -1;
  let bestScore = 0;

  rows.slice(0, 30).forEach((row, index) => {
    const score = scoreHeaderRow(row ?? []);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  // Require at least 3 matching columns to be confident this is the header row
  return bestScore >= 3 ? bestIndex : -1;
}

function scoreHeaderRow(row: (string | number | Date | null)[]) {
  const normalizedCells = row.map(normalizeHeaderCell);
  let score = 0;

  for (const aliases of Object.values(HEADER_ALIASES)) {
    if (normalizedCells.some((cell) => aliases.includes(cell))) {
      score += 1;
    }
  }

  return score;
}

function buildHeaderMap(row: (string | number | Date | null)[]): HeaderMap {
  const map: HeaderMap = {};

  row.forEach((cell, index) => {
    const normalizedCell = normalizeHeaderCell(cell);

    (Object.keys(HEADER_ALIASES) as CanonicalColumn[]).forEach((key) => {
      if (map[key] === undefined && HEADER_ALIASES[key].includes(normalizedCell)) {
        map[key] = index;
      }
    });
  });

  return map;
}

function parseTransactionRow(
  row: (string | number | Date | null)[],
  headerMap: HeaderMap
): ParsedMutualFundTransaction | null {
  const schemeName = toCleanString(readCell(row, headerMap.schemeName));
  const transactionDate = parseGrowwDate(
    String(readCell(row, headerMap.date) ?? '')
  );

  if (!schemeName || !transactionDate) {
    return null;
  }

  const amount = toAmount(readCell(row, headerMap.amount));

  if (amount === null) {
    return null;
  }

  const transactionType = normalizeTransactionType(
    toCleanString(readCell(row, headerMap.transactionType))
  );
  const units = toDecimal(readCell(row, headerMap.units)) ?? 0;
  const nav = toDecimal(readCell(row, headerMap.nav)) ?? 0;

  return {
    schemeName,
    transactionType,
    units,
    nav,
    amount,
    transactionDate,
  };
}

function normalizeTransactionType(value: string): TransactionType {
  if (!value) {
    return 'PURCHASE'; // Default to purchase if not specified
  }

  const normalized = value.toLowerCase().trim();

  // Check direct mapping first
  if (TRANSACTION_TYPE_MAPPING[normalized]) {
    return TRANSACTION_TYPE_MAPPING[normalized];
  }

  // Check if any key is contained in the value
  for (const [key, type] of Object.entries(TRANSACTION_TYPE_MAPPING)) {
    if (normalized.includes(key)) {
      return type;
    }
  }

  // Default to purchase for unknown types
  return 'PURCHASE';
}

function parseGrowwDate(
  value: string | number | Date | null | undefined
): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  // Try to parse Date object
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  // Parse "DD MMM YYYY" format (e.g., "10 Mar 2026")
  const ddMmmYyyy = text.match(/^(\d{1,2})\s+(\w{3,9})\s+(\d{4})$/i);
  if (ddMmmYyyy) {
    const [, day, monthStr, year] = ddMmmYyyy;
    const month = MONTH_MAP[monthStr.toLowerCase()];
    if (month) {
      return `${year}-${month}-${day.padStart(2, '0')}`;
    }
  }

  // Parse "MMM DD YYYY" format (e.g., "Mar 10 2026")
  const mmmDdYyyy = text.match(/^(\w{3,9})\s+(\d{1,2})\s+(\d{4})$/i);
  if (mmmDdYyyy) {
    const [, monthStr, day, year] = mmmDdYyyy;
    const month = MONTH_MAP[monthStr.toLowerCase()];
    if (month) {
      return `${year}-${month}-${day.padStart(2, '0')}`;
    }
  }

  // Try standard date parsing as fallback
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function readCell(
  row: (string | number | Date | null)[],
  index: number | undefined
) {
  if (index === undefined) {
    return null;
  }

  return row[index] ?? null;
}

function normalizeHeaderCell(value: string | number | Date | null) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\n\r]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toCleanString(value: string | number | Date | null) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toAmount(value: string | number | Date | null) {
  if (value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.abs(value) : null;
  }

  // Remove commas and currency symbols
  const normalized = String(value)
    .replace(/,/g, '')
    .replace(/[₹$€£]/g, '')
    .replace(/cr|dr/gi, '')
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

function toDecimal(value: string | number | Date | null) {
  if (value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  // Remove commas
  const normalized = String(value).replace(/,/g, '').trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}
