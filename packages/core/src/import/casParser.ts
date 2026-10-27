// Pure CAMS/KFintech CAS text parser. Input is line-grouped text (one visual
// line per text line, pages separated by `=====PAGE n=====`). No I/O, no PDF
// dependency. Structural failures throw CasParseError; row *meaning* (purchase,
// reversal, noise...) is left to classification, so noise rows are kept with
// units === null.

export type CasRow = {
  line: number;
  date: string;
  amount: number | null;
  nav: number | null;
  units: number | null;
  description: string;
  unitBalance: number | null;
};

export type CasFolio = {
  amc: string;
  schemeTitle: string;
  isin: string;
  folio: string;
  demat: boolean;
  openingUnits: number;
  closingUnits: number;
  totalCost: number;
  rows: CasRow[];
};

export type ParsedCas = {
  periodStart: string;
  periodEnd: string;
  holderPan: string | null;
  amcSummary: { amc: string; cost: number; market: number }[];
  folios: CasFolio[];
};

export class CasParseError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(issues[0] ?? 'CAS parse failed');
    this.name = 'CasParseError';
    this.issues = issues;
  }
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const NUM = String.raw`\(?-?[\d,]+\.\d+\)?`;
const DATE = String.raw`\d{2}-[A-Za-z]{3}-\d{4}`;

const RE_DATE_ROW = new RegExp(`^(${DATE})\\s+(.*)$`);
const RE_PERIOD = new RegExp(`^(${DATE})\\s+To\\s+(${DATE})$`, 'i');
const RE_NUM_ONLY = new RegExp(`^(${NUM})$`);
const RE_TRAILING_NUM = new RegExp(`^(.*\\S)\\s+(${NUM})$`);
const RE_ROW_FULL = new RegExp(`^(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(.*\\S)\\s+(${NUM})$`);
const RE_ROW_FULL_OPEN = new RegExp(`^(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(.*\\S)$`);
const RE_ROW_AMOUNT_NOISE = new RegExp(`^(${NUM})\\s+(\\*\\*\\*.*)$`);
const RE_ROW_UNITS_ONLY = new RegExp(`^(${NUM})\\s+([^\\d(*].*\\S)\\s+(${NUM})$`);
const RE_CLOSING = new RegExp(`^Closing Unit Balance:\\s*(${NUM})\\s+Total Cost Value:\\s*(${NUM})`, 'i');
const RE_OPENING = new RegExp(`^Opening Unit Balance:\\s*(${NUM})`, 'i');
const RE_FOLIO = /^Folio No:\s*(\d+(?:\s*\/\s*\d+)?)/i;
const RE_SUMMARY_ROW = new RegExp(`^(.+?)\\s+(${NUM})\\s+(${NUM})$`);
const RE_ISIN = /ISIN\s*:\s*(INF(?:\s*[A-Z0-9]){9})/;
const RE_DEMAT_MARKER = /\(\s*(Non\s*-?\s*)?Demat\s*\)/i;
const RE_PAN = /PAN:\s*([A-Z]{5}\d{4}[A-Z])/;
const RE_AMC_HEADING = /^[A-Za-z][A-Za-z0-9&.' -]*\bMutual Fund$/;

function num(s: string): number {
  const neg = s.startsWith('(') || s.startsWith('-');
  const v = parseFloat(s.replace(/[(),-]/g, ''));
  return neg ? -v : v;
}

function isoDate(s: string): string {
  const [d, m, y] = s.split('-');
  const mm = MONTHS[m.toLowerCase()];
  if (!mm) throw new CasParseError([`Unrecognised month in date "${s}"`]);
  return `${y}-${mm}-${d}`;
}

// Statement text is PII: error messages carry only a redacted shape of a line.
export function redact(l: string): string {
  const shape = l.replace(/\d/g, '#').replace(/[A-Za-z]/g, 'x');
  return shape.length > 40 ? shape.slice(0, 40) + '…' : shape;
}

const MAX_HEADER_LINES = 6;

function isPageNoise(l: string): boolean {
  return (
    /^=====PAGE\s+\d+=====$/.test(l) ||
    /^CAMSCASWS/i.test(l) ||
    /^Consolidated Account Statement$/i.test(l) ||
    RE_PERIOD.test(l) ||
    /^Page\s+\d+\s+of\s+\d+$/i.test(l) ||
    /^Date\s+Amount\s+Price/i.test(l) ||
    /^\(INR\)\s+\(INR\)\s+Balance$/i.test(l)
  );
}

type Pending = { row: CasRow; needsBalance: boolean; openNoise: boolean };

export function parseCasText(text: string): ParsedCas {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());
  const issues: string[] = [];

  if (!lines.some((l) => /^Consolidated Account Statement$/i.test(l))) {
    throw new CasParseError(['Not a CAS: no "Consolidated Account Statement" header found']);
  }
  let periodStart = '';
  let periodEnd = '';
  for (const l of lines) {
    const m = RE_PERIOD.exec(l);
    if (m) {
      periodStart = isoDate(m[1]);
      periodEnd = isoDate(m[2]);
      break;
    }
  }
  if (!periodStart) throw new CasParseError(['Statement period line ("DD-Mon-YYYY To DD-Mon-YYYY") not found']);

  const amcSummary: ParsedCas['amcSummary'] = [];
  const knownAmcs = new Set<string>();
  const folios: CasFolio[] = [];
  let holderPan: string | null = null;

  type State = 'preamble' | 'summary' | 'between' | 'block';
  let state: State = 'preamble';
  let amc: string | null = null;
  let headerBuf: string[] = [];

  // current block
  type Block = {
    header: Omit<CasFolio, 'rows' | 'openingUnits' | 'closingUnits' | 'totalCost'>;
    opening: number | null;
    rows: CasRow[];
    tail: boolean;
    pending: Pending | null;
  };
  let cur = null as Block | null;

  const where = (i: number) => (cur ? `folio ${cur.header.folio} (${cur.header.isin}), line ${i + 1}` : `line ${i + 1}`);

  const scanPan = (l: string) => {
    if (holderPan) return;
    const m = RE_PAN.exec(l);
    if (m) holderPan = m[1];
  };

  const startBlock = (folioLine: string, i: number) => {
    const folio = RE_FOLIO.exec(folioLine)![1].replace(/\s*\/\s*/, ' / ');
    const joined = headerBuf.filter((l) => !/^PAN:/i.test(l)).join(' ');
    const isinM = RE_ISIN.exec(joined);
    if (!isinM) {
      throw new CasParseError([`Scheme block for folio ${folio} (line ${i + 1}) has no ISIN`]);
    }
    if (!amc) throw new CasParseError([`Scheme block for folio ${folio} (line ${i + 1}) appears before any AMC heading`]);
    const isin = isinM[1].replace(/\s/g, '');
    const dm = RE_DEMAT_MARKER.exec(joined);
    const cut = dm ? dm.index : isinM.index;
    const schemeTitle = joined.slice(0, cut).replace(/[\s-]+$/, '').trim();
    cur = {
      header: { amc, schemeTitle, isin, folio, demat: !!dm && !dm[1] },
      opening: null,
      rows: [],
      tail: false,
      pending: null,
    };
    headerBuf = [];
    state = 'block';
  };

  const flushPending = (i: number) => {
    // a pending row that never got its balance
    if (cur?.pending) {
      throw new CasParseError([`Row at ${where(cur.pending.row.line - 1)} has no unit balance (next content at line ${i + 1})`]);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;

    if (state === 'preamble') {
      scanPan(l);
      if (!holderPan) {
        const m = /\b([A-Z]{5}\d{4}[A-Z])\b/.exec(l);
        if (m && !/^CAMSCASWS/.test(l)) holderPan = m[1];
      }
      if (/^PORTFOLIO SUMMARY$/i.test(l)) state = 'summary';
      else if (/^Date Amount Price/i.test(l)) state = 'between';
      continue;
    }

    if (state === 'summary') {
      if (/^Date Amount Price/i.test(l)) {
        state = 'between';
        continue;
      }
      if (/^Total\b/i.test(l)) continue;
      const m = RE_SUMMARY_ROW.exec(l);
      if (m) {
        amcSummary.push({ amc: m[1], cost: num(m[2]), market: num(m[3]) });
        knownAmcs.add(m[1]);
      }
      continue;
    }

    if (state === 'between') {
      if (isPageNoise(l)) continue;
      scanPan(l);
      if (RE_FOLIO.test(l)) {
        startBlock(l, i);
        continue;
      }
      if (headerBuf.length === 0 && (knownAmcs.has(l) || (RE_AMC_HEADING.test(l) && !/ISIN/.test(l)))) {
        amc = l;
        continue;
      }
      if (/^PAN:/i.test(l)) continue;
      if (/ISIN/.test(l) && headerBuf.some((h) => /ISIN/.test(h))) {
        throw new CasParseError([`Second ISIN header at line ${i + 1} before a Folio No line (previous scheme block lost its folio): shape "${redact(l)}"`]);
      }
      if (headerBuf.length >= MAX_HEADER_LINES) {
        throw new CasParseError([`Scheme header exceeds ${MAX_HEADER_LINES} lines without a Folio No line (line ${i + 1}): shape "${redact(l)}"`]);
      }
      headerBuf.push(l);
      continue;
    }

    // state === 'block'
    const b = cur!;
    if (isPageNoise(l)) continue;

    const closing = RE_CLOSING.exec(l);
    if (closing) {
      flushPending(i);
      if (b.opening === null) {
        issues.push(`Folio ${b.header.folio} (${b.header.isin}) has no Opening Unit Balance line`);
      } else {
        folios.push({
          ...b.header,
          openingUnits: b.opening,
          closingUnits: num(closing[1]),
          totalCost: num(closing[2]),
          rows: b.rows,
        });
      }
      cur = null;
      state = 'between';
      continue;
    }

    if (b.opening === null) {
      const om = RE_OPENING.exec(l);
      if (om) b.opening = num(om[1]);
      // everything before Opening Unit Balance is holder / nominee header text
      continue;
    }

    // wrapped continuation of a pending row
    if (b.pending) {
      const p = b.pending;
      if (RE_DATE_ROW.test(l)) flushPending(i);
      else if (p.openNoise) {
        p.row.description += ' ' + l;
        if (l.endsWith('***')) {
          b.rows.push(p.row);
          b.pending = null;
        }
        continue;
      } else {
        const only = RE_NUM_ONLY.exec(l);
        const tr = RE_TRAILING_NUM.exec(l);
        if (only) {
          p.row.unitBalance = num(only[1]);
        } else if (tr) {
          p.row.description += ' ' + tr[1];
          p.row.unitBalance = num(tr[2]);
        } else {
          p.row.description += ' ' + l;
          continue;
        }
        b.rows.push(p.row);
        b.pending = null;
        continue;
      }
    }

    const dm = RE_DATE_ROW.exec(l);
    if (dm) {
      const date = isoDate(dm[1]);
      const rest = dm[2];
      const row: CasRow = { line: i + 1, date, amount: null, nav: null, units: null, description: '', unitBalance: null };
      let m: RegExpExecArray | null;
      if ((m = RE_ROW_FULL.exec(rest))) {
        row.amount = num(m[1]); row.nav = num(m[2]); row.units = num(m[3]);
        row.description = m[4]; row.unitBalance = num(m[5]);
        b.rows.push(row);
      } else if ((m = RE_ROW_FULL_OPEN.exec(rest))) {
        row.amount = num(m[1]); row.nav = num(m[2]); row.units = num(m[3]);
        row.description = m[4];
        b.pending = { row, needsBalance: true, openNoise: false };
      } else if ((m = RE_ROW_AMOUNT_NOISE.exec(rest))) {
        row.amount = num(m[1]);
        row.description = m[2];
        b.rows.push(row);
      } else if (rest.startsWith('***')) {
        row.description = rest;
        if (rest.length > 3 && rest.endsWith('***')) b.rows.push(row);
        else b.pending = { row, needsBalance: false, openNoise: true };
      } else if ((m = RE_ROW_UNITS_ONLY.exec(rest))) {
        row.units = num(m[1]);
        row.description = m[2];
        row.unitBalance = num(m[3]);
        b.rows.push(row);
      } else {
        throw new CasParseError([`Unrecognised transaction row in ${where(i)}: shape "${redact(l)}"`]);
      }
      continue;
    }

    // known boilerplate between the last row and the closing line
    if (/^NAV on /i.test(l) || /^Entry load/i.test(l) || /^Exit load/i.test(l)) {
      b.tail = true;
      continue;
    }
    // load / cost-of-acquisition / footnote paragraph text. Date-less only:
    // every real transaction row starts with a date and is handled above.
    if (b.tail) continue;
    throw new CasParseError([`Unrecognised line in ${where(i)}: shape "${redact(l)}"`]);
  }

  const open = cur as Block | null;
  if (open) {
    const b = open;
    issues.push(`Folio ${b.header.folio} (${b.header.isin}) has no Closing Unit Balance line`);
  } else if (headerBuf.some((l) => /ISIN/.test(l))) {
    issues.push('Incomplete scheme block at end of statement: ISIN header without a Folio No line');
  }
  if (issues.length) throw new CasParseError(issues);
  if (folios.length === 0) throw new CasParseError(['No scheme blocks found in the statement']);

  return { periodStart, periodEnd, holderPan, amcSummary, folios };
}
