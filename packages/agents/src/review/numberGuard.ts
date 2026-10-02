export type NumberToken = { raw: string; value: number; tolerance: number; kind: 'inr' | 'pct' | 'plain' };
export type Facts = { numbers: number[]; strings: string[] };

const NUM_RE = /(₹\s?|Rs\.?\s?|INR\s?)?[-−]?(\d[\d,]*(?:\.\d+)?)\s*(crores?\b|cr\b|lakhs?\b|lacs?\b|L\b|k\b|%|pp\b|percentage points?\b)?/gi;
const PERIOD_AFTER = /^\s*-?\s*(years?|yrs?|y|months?|mo)\b/i;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const DAY_MONTH = /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi;
const INDEX_NAME = /\b(nifty|sensex|bse|large\s?midcap|largemidcap|midcap|mid\s?cap|smallcap|small\s?cap|microcap)\s*\d+\b(?!%|\.\d)/gi;

function multiplierFor(unit: string): number {
  if (/^cr/.test(unit)) return 1e7;
  if (/^(lakh|lac|l$)/.test(unit)) return 1e5;
  if (unit === 'k') return 1e3;
  return 1;
}

function parseAll(text: string): (NumberToken & { index: number; end: number; integer: boolean })[] {
  const out: (NumberToken & { index: number; end: number; integer: boolean })[] = [];
  for (const m of text.matchAll(NUM_RE)) {
    const numStr = m[2].replace(/,/g, '');
    const base = Number(numStr);
    if (!Number.isFinite(base)) continue;
    const decimals = (numStr.split('.')[1] ?? '').length;
    const unit = (m[3] ?? '').toLowerCase();
    const mult = multiplierFor(unit);
    const isPct = unit === '%' || unit.startsWith('pp') || unit.startsWith('percentage');
    const kind: NumberToken['kind'] = m[1] || mult > 1 ? 'inr' : isPct ? 'pct' : 'plain';
    let tolerance = 0.5 * Math.pow(10, -decimals) * mult;
    if (kind === 'pct') tolerance = Math.max(tolerance, 0.1);
    out.push({
      raw: m[0].trim(), value: base * mult, tolerance, kind,
      index: m.index ?? 0, end: (m.index ?? 0) + m[0].length, integer: decimals === 0,
    });
  }
  return out;
}

export function extractNumbers(text: string): NumberToken[] {
  return parseAll(text).map(({ raw, value, tolerance, kind }) => ({ raw, value, tolerance, kind }));
}

export function collectFacts(factSheet: unknown): Facts {
  const numbers: number[] = [];
  const strings: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'number' && Number.isFinite(v)) numbers.push(v);
    else if (typeof v === 'string') {
      strings.push(v);
      for (const t of extractNumbers(v)) numbers.push(t.value);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(factSheet);
  return { numbers, strings };
}

function stripKnown(text: string, facts: Facts): string {
  let t = text;
  const withDigits = facts.strings.filter((s) => /\d/.test(s) && s.length >= 3).sort((a, b) => b.length - a.length);
  for (const s of withDigits) {
    const needle = s.toLowerCase();
    let i = t.toLowerCase().indexOf(needle);
    while (i >= 0) {
      t = `${t.slice(0, i)} ${t.slice(i + s.length)}`;
      i = t.toLowerCase().indexOf(needle);
    }
  }
  return t.replace(ISO_DATE, ' ').replace(DAY_MONTH, ' ').replace(INDEX_NAME, ' ');
}

function supported(tok: NumberToken, facts: Facts): boolean {
  const v = Math.abs(tok.value);
  return facts.numbers.some((f) => {
    const a = Math.abs(f);
    if (Math.abs(a - v) <= tok.tolerance + 1e-9) return true;
    return tok.kind === 'inr' && a > 0 && Math.abs(a - v) <= 0.01 * a;
  });
}

export function checkText(text: string, facts: Facts): { ok: boolean; unsupported: string[] } {
  const stripped = stripKnown(text, facts);
  const unsupported: string[] = [];
  for (const tok of parseAll(stripped)) {
    if (tok.kind === 'plain' && tok.integer) {
      const n = tok.value;
      if (n <= 12 || (n >= 1990 && n <= 2100) || PERIOD_AFTER.test(stripped.slice(tok.end))) continue;
    }
    if (!supported(tok, facts)) unsupported.push(tok.raw);
  }
  return { ok: unsupported.length === 0, unsupported };
}

export function resolvePath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const m of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    const key = m[2] !== undefined ? Number(m[2]) : m[1];
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}
