import * as XLSX from 'xlsx';

export type HoldingCategory = 'equity' | 'debt' | 'hybrid' | 'other';

export type ParsedHolding = {
  schemeName: string;
  amcName: string;
  category: HoldingCategory;
  subCategory: string;
  folioNumber: string;
  units: number;
  investedValue: number;
  currentValue: number;
  returnsAmount: number;
  returnsXirr: number | null;
};

export type ParsedHoldingsData = {
  asOfDate: string; // YYYY-MM-DD format
  summary: {
    totalInvested: number;
    totalCurrentValue: number;
    totalXirr: number | null;
    holderName?: string;
    holderPan?: string;
  };
  holdings: ParsedHolding[];
};

type HoldingsHeaderMap = Partial<Record<HoldingsCanonicalColumn, number>>;

type HoldingsCanonicalColumn =
  | 'schemeName'
  | 'amc'
  | 'category'
  | 'subCategory'
  | 'folioNumber'
  | 'source'
  | 'units'
  | 'investedValue'
  | 'currentValue'
  | 'returns'
  | 'xirr';

const HOLDINGS_HEADER_ALIASES: Record<HoldingsCanonicalColumn, string[]> = {
  schemeName: ['scheme name', 'fund name', 'scheme'],
  amc: ['amc', 'amc name', 'fund house'],
  category: ['category', 'fund category'],
  subCategory: ['sub category', 'subcategory', 'sub-category'],
  folioNumber: ['folio no', 'folio number', 'folio'],
  source: ['source', 'platform'],
  units: ['units', 'unit balance', 'total units'],
  investedValue: ['invested value', 'investment value', 'invested amount', 'cost value'],
  currentValue: ['current value', 'market value', 'nav value'],
  returns: ['returns', 'gain loss', 'profit loss', 'profit/loss', 'gain/loss'],
  xirr: ['xirr', 'xirr %', 'returns %'],
};

/**
 * Parses a Groww Holdings Statement Excel file.
 * @param fileBuffer - ArrayBuffer of the Excel file
 * @param filename - Optional filename to extract as-of date from
 * @returns ParsedHoldingsData with summary and holdings array
 */
export function parseGrowwHoldingsXls(
  fileBuffer: ArrayBuffer,
  filename?: string
): ParsedHoldingsData {
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

  if (rows.length === 0) {
    throw new Error('The holdings file is empty.');
  }

  // Extract personal details from header section
  const personalDetails = extractPersonalDetails(rows);

  // Extract summary data
  const summary = extractSummary(rows);

  // Extract as-of date from header or filename
  const asOfDate = extractAsOfDate(rows, filename);

  // Find holdings header row and parse holdings
  const headerRowIndex = findHoldingsHeaderRowIndex(rows);

  if (headerRowIndex === -1) {
    throw new Error(
      'Could not detect a holdings header row. Ensure the file contains columns like "Scheme Name", "AMC", "Category", etc.'
    );
  }

  const headerMap = buildHoldingsHeaderMap(rows[headerRowIndex] ?? []);

  if (
    headerMap.schemeName === undefined ||
    headerMap.investedValue === undefined ||
    headerMap.currentValue === undefined
  ) {
    throw new Error(
      'The selected Excel file is missing required columns (Scheme Name, Invested Value, or Current Value).'
    );
  }

  const holdings: ParsedHolding[] = [];

  for (const row of rows.slice(headerRowIndex + 1)) {
    const holding = parseHoldingRow(row ?? [], headerMap);

    if (holding) {
      holdings.push(holding);
    }
  }

  if (holdings.length === 0) {
    throw new Error('No holdings rows were found in the selected Excel file.');
  }

  return {
    asOfDate,
    summary: {
      totalInvested: summary.totalInvested,
      totalCurrentValue: summary.totalCurrentValue,
      totalXirr: summary.totalXirr,
      holderName: personalDetails.name,
      holderPan: personalDetails.pan,
    },
    holdings,
  };
}

function extractPersonalDetails(rows: (string | number | Date | null)[][]) {
  let name: string | undefined;
  let pan: string | undefined;

  // Look in the first 10 rows for personal details
  for (const row of rows.slice(0, 10)) {
    const firstCell = normalizeHeaderCell(row[0]);
    const secondCell = toCleanString(row[1]);

    if (firstCell === 'name' && secondCell) {
      name = secondCell;
    } else if (firstCell === 'pan' && secondCell) {
      pan = secondCell;
    }
  }

  return { name, pan };
}

function extractSummary(rows: (string | number | Date | null)[][]) {
  let totalInvested = 0;
  let totalCurrentValue = 0;
  let totalXirr: number | null = null;

  // Look for summary section in first 15 rows
  for (let i = 0; i < Math.min(rows.length - 1, 15); i++) {
    const row = rows[i] ?? [];
    const normalizedFirstCell = normalizeHeaderCell(row[0]);

    // Check if this is the summary header row
    if (
      normalizedFirstCell === 'total investments' ||
      normalizedFirstCell.includes('total investment')
    ) {
      // The values should be in the next row
      const valueRow = rows[i + 1];

      if (valueRow) {
        totalInvested = toAmount(valueRow[0]) ?? 0;
        totalCurrentValue = toAmount(valueRow[1]) ?? 0;
        // XIRR is typically in the 5th column (index 4)
        totalXirr = toPercentage(valueRow[4]);
      }
      break;
    }
  }

  return { totalInvested, totalCurrentValue, totalXirr };
}

function extractAsOfDate(
  rows: (string | number | Date | null)[][],
  filename?: string
): string {
  // First, try to find date in the rows (look for "HOLDINGS AS ON" pattern)
  for (const row of rows.slice(0, 15)) {
    const firstCell = String(row[0] ?? '');
    const asOnMatch = firstCell.match(/holdings\s+as\s+on\s+(\d{4}-\d{2}-\d{2})/i);

    if (asOnMatch) {
      return asOnMatch[1];
    }

    // Also try DD-MM-YYYY or DD/MM/YYYY format
    const altMatch = firstCell.match(/holdings\s+as\s+on\s+(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i);

    if (altMatch) {
      const [, day, month, year] = altMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // Try to extract from filename (e.g., Holdings_Statement_2026-04-04.xlsx)
  if (filename) {
    const filenameMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);

    if (filenameMatch) {
      return filenameMatch[1];
    }

    // Try DD-MM-YYYY format in filename
    const altFilenameMatch = filename.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);

    if (altFilenameMatch) {
      const [, day, month, year] = altFilenameMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // Default to today's date if not found
  return new Date().toISOString().slice(0, 10);
}

function findHoldingsHeaderRowIndex(rows: (string | number | Date | null)[][]) {
  let bestIndex = -1;
  let bestScore = 0;

  rows.slice(0, 30).forEach((row, index) => {
    const score = scoreHoldingsHeaderRow(row ?? []);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  // Require at least 4 matching columns to consider it a valid header
  return bestScore >= 4 ? bestIndex : -1;
}

function scoreHoldingsHeaderRow(row: (string | number | Date | null)[]) {
  const normalizedCells = row.map(normalizeHeaderCell);
  let score = 0;

  for (const aliases of Object.values(HOLDINGS_HEADER_ALIASES)) {
    if (normalizedCells.some((cell) => aliases.includes(cell))) {
      score += 1;
    }
  }

  return score;
}

function buildHoldingsHeaderMap(
  row: (string | number | Date | null)[]
): HoldingsHeaderMap {
  const map: HoldingsHeaderMap = {};

  row.forEach((cell, index) => {
    const normalizedCell = normalizeHeaderCell(cell);

    (Object.keys(HOLDINGS_HEADER_ALIASES) as HoldingsCanonicalColumn[]).forEach(
      (key) => {
        if (
          map[key] === undefined &&
          HOLDINGS_HEADER_ALIASES[key].includes(normalizedCell)
        ) {
          map[key] = index;
        }
      }
    );
  });

  return map;
}

function parseHoldingRow(
  row: (string | number | Date | null)[],
  headerMap: HoldingsHeaderMap
): ParsedHolding | null {
  const schemeName = toCleanString(readCell(row, headerMap.schemeName));
  const investedValue = toAmount(readCell(row, headerMap.investedValue));
  const currentValue = toAmount(readCell(row, headerMap.currentValue));

  // Skip rows without essential data
  if (!schemeName || investedValue === null || currentValue === null) {
    return null;
  }

  const amcName = toCleanString(readCell(row, headerMap.amc)) || '';
  const categoryRaw = toCleanString(readCell(row, headerMap.category));
  const category = mapCategory(categoryRaw);
  const subCategory = toCleanString(readCell(row, headerMap.subCategory)) || '';
  const folioNumber = toCleanString(readCell(row, headerMap.folioNumber)) || '';
  const units = toAmount(readCell(row, headerMap.units)) ?? 0;
  const returnsAmount = toAmount(readCell(row, headerMap.returns)) ?? currentValue - investedValue;
  const returnsXirr = toPercentage(readCell(row, headerMap.xirr));

  return {
    schemeName,
    amcName,
    category,
    subCategory,
    folioNumber,
    units,
    investedValue,
    currentValue,
    returnsAmount,
    returnsXirr,
  };
}

function mapCategory(categoryRaw: string): HoldingCategory {
  const normalized = categoryRaw.toLowerCase().trim();

  if (normalized === 'equity' || normalized.includes('equity')) {
    return 'equity';
  }

  if (normalized === 'debt' || normalized.includes('debt')) {
    return 'debt';
  }

  if (normalized === 'hybrid' || normalized.includes('hybrid') || normalized.includes('balanced')) {
    return 'hybrid';
  }

  return 'other';
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

/**
 * Parses amount strings, handling Indian number format (e.g., "10,82,030.81")
 */
function toAmount(value: string | number | Date | null): number | null {
  if (value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  // Remove all commas (handles both Indian and international format)
  const normalized = String(value)
    .replace(/,/g, '')
    .replace(/[^\d.\-]/g, '')
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parses percentage strings (e.g., "11.97%", "-6.34%")
 */
function toPercentage(value: string | number | Date | null): number | null {
  if (value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value)
    .replace(/%/g, '')
    .replace(/,/g, '')
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}
