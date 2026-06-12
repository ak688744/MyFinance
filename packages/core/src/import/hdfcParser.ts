import * as XLSX from 'xlsx';
import {
  createCategorizationInput,
} from '../domain/categorize';

export type ParsedTransaction = {
  transactionDate: string;
  valueDate: string | null;
  referenceNumber: string | null;
  description: string;
  normalizedDescription: string;
  merchantKey: string | null;
  upiNoteKeyword: string | null;
  amount: number;
  direction: 'debit' | 'credit';
  balance: number | null;
  sourceType: 'xls';
  dedupeKey: string;
};

type HeaderMap = Partial<Record<CanonicalColumn, number>>;

type CanonicalColumn =
  | 'transactionDate'
  | 'valueDate'
  | 'referenceNumber'
  | 'description'
  | 'debit'
  | 'credit'
  | 'balance';

const HEADER_ALIASES: Record<CanonicalColumn, string[]> = {
  transactionDate: ['date', 'txn date', 'transaction date'],
  valueDate: ['value dt', 'value date'],
  referenceNumber: ['chq ref no', 'ref no', 'chq no', 'cheque no'],
  description: ['narration', 'description', 'particulars', 'remarks'],
  debit: ['withdrawal amt', 'debit', 'debit amount', 'withdrawal'],
  credit: ['deposit amt', 'credit', 'credit amount', 'deposit'],
  balance: ['closing balance', 'balance'],
};

export function parseHdfcStatementXls(fileBuffer: ArrayBuffer) {
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

  const headerRowIndex = findHeaderRowIndex(rows);

  if (headerRowIndex === -1) {
    throw new Error(
      'Could not detect an HDFC statement header row. Export the statement as Excel with the table headers visible.'
    );
  }

  const headerMap = buildHeaderMap(rows[headerRowIndex] ?? []);

  if (
    headerMap.transactionDate === undefined ||
    headerMap.description === undefined
  ) {
    throw new Error(
      'The selected Excel file is missing required transaction date or description columns.'
    );
  }

  const transactions: ParsedTransaction[] = [];

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

  return transactions;
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
) {
  const transactionDate = toIsoDate(
    readCell(row, headerMap.transactionDate) ?? ''
  );
  const description = toCleanString(readCell(row, headerMap.description));

  if (!transactionDate || !description) {
    return null;
  }

  const debitAmount = toAmount(readCell(row, headerMap.debit));
  const creditAmount = toAmount(readCell(row, headerMap.credit));

  if (debitAmount === null && creditAmount === null) {
    return null;
  }

  const direction: ParsedTransaction['direction'] =
    debitAmount !== null ? 'debit' : 'credit';
  const amount = debitAmount ?? creditAmount ?? 0;
  const normalizedDescription = normalizeDescription(description);
  const categorizationInput = createCategorizationInput(description);
  const balance = toAmount(readCell(row, headerMap.balance));
  const valueDate = toIsoDate(readCell(row, headerMap.valueDate) ?? '');
  const referenceNumber = toReferenceNumber(
    readCell(row, headerMap.referenceNumber)
  );

  return {
    transactionDate,
    valueDate,
    referenceNumber,
    description,
    normalizedDescription,
    merchantKey: categorizationInput.merchantKey,
    upiNoteKeyword: categorizationInput.upiNoteKeyword,
    amount,
    direction,
    balance,
    sourceType: 'xls' as const,
    dedupeKey: buildDedupeKey({
      transactionDate,
      amount,
      direction,
      normalizedDescription,
      referenceNumber,
    }),
  };
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

function normalizeDescription(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 /.-]+/g, '')
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

  const normalized = String(value)
    .replace(/,/g, '')
    .replace(/cr|dr/gi, '')
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

function toIsoDate(value: string | number | Date | null) {
  if (value === null || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  const slashOrDashMatch = text.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/
  );

  if (slashOrDashMatch) {
    const [, day, month, yearPart] = slashOrDashMatch;
    const year =
      yearPart.length === 2 ? `20${yearPart.padStart(2, '0')}` : yearPart;

    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function buildDedupeKey(input: {
  transactionDate: string;
  amount: number;
  direction: 'debit' | 'credit';
  normalizedDescription: string;
  referenceNumber: string | null;
}) {
  return [
    input.transactionDate,
    input.direction,
    input.amount.toFixed(2),
    input.normalizedDescription,
    input.referenceNumber ?? '',
  ].join('|');
}

function toReferenceNumber(value: string | number | Date | null) {
  const cleaned = toCleanString(value);
  return cleaned ? cleaned : null;
}
