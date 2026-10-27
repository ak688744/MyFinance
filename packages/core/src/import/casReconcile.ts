// CAS reconciliation (spec D2/D6): parse + classify + verify every folio against
// the statement's own numbers before anything is imported. All failures are
// collected and thrown once. Pure: no I/O, no DB.
import { parseCasText, CasParseError, type CasFolio } from './casParser';
import { classifyCasFolio, type CasTx } from './casClassify';

export type ParsedCasImport = {
  periodStart: string;
  periodEnd: string;
  holderPan: string | null;
  transactions: CasTx[];
  /** Distinct ISINs whose folios in this statement all close at zero units (fully exited funds). */
  exitedIsinCount: number;
};

// Thrown for any parse OR reconciliation failure; callers map it to HTTP 400.
// Parser failures (CasParseError) are converted so a single catch suffices.
export class CasImportError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    const capped = issues.slice(0, MAX_ISSUES);
    super(capped[0] ?? 'CAS import failed');
    this.name = 'CasImportError';
    this.issues = capped;
  }
}

const MAX_ISSUES = 20;
const UNIT_TOL = 0.001;
const COST_TOL = 1;
const fmt = (n: number) => n.toFixed(3);
const money = (n: number) => n.toFixed(2);

const label = (f: CasFolio) => `Folio ${f.folio} (${f.isin})`;

// Private FIFO over classified transactions in INPUT (statement) order, costing
// buys by GROSS amount per unit (segregated lots have amount 0 -> cost 0).
// Deliberately not domain/performance/lots.ts: its same-date sort reverses
// same-date buys, which would distort remaining cost.
const FIFO_EPS = 1e-9;
function remainingCost(txs: CasTx[]): number {
  const lots: { units: number; costPerUnit: number }[] = [];
  for (const t of txs) {
    if (t.transactionType === 'PURCHASE') {
      lots.push({ units: t.units, costPerUnit: t.units > 0 ? t.amount / t.units : 0 });
      continue;
    }
    let left = t.units;
    while (left > FIFO_EPS && lots.length > 0) {
      const take = Math.min(left, lots[0].units);
      lots[0].units -= take;
      left -= take;
      if (lots[0].units <= FIFO_EPS) lots.shift();
    }
  }
  return lots.reduce((s, l) => s + l.units * l.costPerUnit, 0);
}

const normAmc = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export function buildCasImport(text: string): ParsedCasImport {
  let parsed;
  try {
    parsed = parseCasText(text);
  } catch (e) {
    if (e instanceof CasParseError) throw new CasImportError(e.issues);
    throw e;
  }

  const issues: string[] = [];
  const transactions: CasTx[] = [];
  const amcCost = new Map<string, { name: string; derived: number; folios: number }>();

  const closingByIsin = new Map<string, number>();
  for (const f of parsed.folios) {
    closingByIsin.set(f.isin, (closingByIsin.get(f.isin) ?? 0) + f.closingUnits);
    const where = label(f);
    const cls = classifyCasFolio(f);
    issues.push(...cls.issues);
    transactions.push(...cls.transactions);

    if (Math.abs(f.openingUnits) > UNIT_TOL) {
      issues.push(`${where}: statement has a non-zero opening balance; request a statement from inception (include zero-balance folios)`);
    }

    // Running balance over the RAW rows (reversed/rejected rows included).
    let bal = f.openingUnits;
    let rowIssue = false;
    for (const r of f.rows) {
      if (r.units === null) continue;
      bal += r.units;
      if (!rowIssue && r.unitBalance === null) {
        issues.push(`${where}, line ${r.line}: row has no stated unit balance`);
        rowIssue = true;
      } else if (!rowIssue && Math.abs(bal - r.unitBalance!) > UNIT_TOL) {
        issues.push(`${where}, line ${r.line}: running balance ${fmt(bal)} does not match stated ${fmt(r.unitBalance!)}`);
        rowIssue = true;
      }
    }
    // Full sum is used for the closing check; skipped once a row-level issue already explains it.
    if (!rowIssue && Math.abs(bal - f.closingUnits) > UNIT_TOL) {
      issues.push(`${where}: derived closing units ${fmt(bal)} do not match stated ${fmt(f.closingUnits)}`);
    }

    const cost = remainingCost(cls.transactions);
    if (Math.abs(cost - f.totalCost) > COST_TOL) {
      issues.push(`${where}: derived cost ${money(cost)} does not match stated Total Cost Value ${money(f.totalCost)}`);
    }
    const key = normAmc(f.amc);
    const a = amcCost.get(key) ?? { name: f.amc, derived: 0, folios: 0 };
    a.derived += cost;
    a.folios += 1;
    amcCost.set(key, a);
  }

  for (const [key, a] of amcCost) {
    const amc = a.name;
    const s = parsed.amcSummary.find((x) => normAmc(x.amc) === key);
    if (!s) {
      // A fully redeemed AMC may be absent from the summary; only non-zero cost is an issue.
      if (Math.abs(a.derived) > COST_TOL) issues.push(`AMC "${amc}": not present in the portfolio summary`);
    } else if (Math.abs(a.derived - s.cost) > COST_TOL * a.folios) {
      issues.push(`AMC "${amc}": derived cost ${money(a.derived)} does not match portfolio summary ${money(s.cost)}`);
    }
  }

  if (issues.length) throw new CasImportError(issues);
  if (transactions.length === 0) throw new CasImportError(['The statement has no transactions']);
  const exitedIsinCount = [...closingByIsin.values()].filter((u) => Math.abs(u) <= UNIT_TOL).length;
  return { periodStart: parsed.periodStart, periodEnd: parsed.periodEnd, holderPan: parsed.holderPan, transactions, exitedIsinCount };
}
