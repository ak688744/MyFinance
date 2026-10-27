// Pure classification of CAS rows into PURCHASE / REDEMPTION transactions
// (spec D3 + Task 1 rulings). Anything not recognised becomes an issue naming
// the folio and line with a redacted shape only; rows are never silently skipped.
import { redact, type CasFolio, type CasRow } from './casParser';

export type CasTx = {
  isin: string;
  folio: string;
  schemeTitle: string;
  transactionType: 'PURCHASE' | 'REDEMPTION';
  units: number;
  nav: number;
  amount: number;
  transactionDate: string;
};

const round2 = (x: number) => Math.round(x * 100) / 100;
const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005;
const sameUnits = (a: number, b: number) => Math.abs(a - b) < 0.0005;

const RE_STAMP = /^\*+\s*Stamp Duty\s*\*+$/i;
// Dated marker rows with no money movement in the units column.
const RE_NOISE = [
  /STT Paid/i,
  /Address Updated/i,
  /Change\s*\/\s*Regn of Nominee/i,
  /Registration of Nominee/i,
  /Change of Date of Birth/i,
  /KYC Failed/i,
  /^\*+\s*Cancelled\s*\*+$/i,
  /Refund Primary KYC/i,
  /Residual distributable cash/i,
  /Insurance SIP/i,
  /^\*+\s*Invalid Purchase/i,
  /Updation of KYC/i,
];
// Start-anchored allowlist of real purchase shapes; the deny guard wins even
// when a description also starts with an allowed word.
const RE_PURCHASE = [/^((New|Additional)\s+)?Purchase\b/i, /^Systematic\s+Purchase\b/i, /^CSIP\s+Purchase\b/i, /^Systematic Investment\b/i, /^Sys\.\s*Investment\b/i];
const RE_DENY = /Switch|Transfer|Dividend|IDCW|Reinvest|\bSTP\b|\bSWP\b/i;

type Entry = {
  tx: CasTx;
  net: number; // purchase row amount before stamp duty (reversal match key)
  kind: 'purchase' | 'segregated' | 'redemption';
  stamped: boolean;
  dead: boolean;
  row: CasRow;
};

type Pending = { row: CasRow; net: number; units: number; date: string };

export function classifyCasFolio(folio: CasFolio): { transactions: CasTx[]; issues: string[] } {
  const issues: string[] = [];
  const entries: Entry[] = [];
  const where = (r: CasRow) => `Folio ${folio.folio} (${folio.isin}), line ${r.line}`;
  let afterBad: string | null = null; // date of a flagged row not yet followed by a classified row
  const shape = (r: CasRow) => `shape "${redact(`${r.date} ${r.description}`)}"`;
  let prev: 'purchase' | 'cancel' | 'other' = 'other'; // previous classified row, for stamp-duty attachment
  const bad = (r: CasRow, why: string, stamp = false) =>
    (stamp || ((afterBad = r.date), (prev = 'other')), issues.push(`${where(r)}: ${why}, ${shape(r)}`));
  const base = { isin: folio.isin, folio: folio.folio, schemeTitle: folio.schemeTitle };

  // Cancelling (negative purchase-like) rows with no earlier purchase wait here
  // for the first later same-date purchase with equal net amount and units.
  const pending: Pending[] = [];
  const flushPending = (keepDate: string | null) => {
    for (let i = pending.length - 1; i >= 0; i--) {
      if (keepDate !== null && pending[i].date === keepDate) continue;
      bad(pending[i].row, 'cancelled purchase with no matching purchase');
      pending.splice(i, 1);
    }
  };
  let cancelDate = '';

  for (let ri = 0; ri < folio.rows.length; ri++) {
    const r = folio.rows[ri];
    const d = r.description.trim();
    flushPending(r.date);

    if (r.units === null) {
      if (RE_STAMP.test(d)) {
        const last = entries[entries.length - 1];
        const before = entries[entries.length - 2];
        if (afterBad === r.date) {
          // follows a row already reported as an issue
        } else if (r.amount !== null && r.amount < 0) {
          // negative stamp belongs to the immediately preceding cancelling row
          if (prev === 'cancel' && cancelDate === r.date) prev = 'other';
          else bad(r, 'negative stamp duty row without a preceding cancelling row', true);
        } else {
          const ok = prev === 'purchase' && !!last && last.kind === 'purchase' && !last.stamped && last.tx.transactionDate === r.date;
          const ambiguous = ok && !!before && before.kind === 'purchase' && !before.dead && !before.stamped && before.tx.transactionDate === r.date;
          if (!ok || ambiguous || r.amount === null) {
            bad(r, ambiguous ? 'stamp duty row is ambiguous between same-date purchases' : 'stamp duty row without an immediately preceding same-date purchase', true);
          } else {
            last.stamped = true;
            last.tx.amount = round2(last.tx.amount + r.amount);
            prev = 'other';
          }
        }
      } else if (!RE_NOISE.some((re) => re.test(d))) {
        bad(r, 'unrecognised row');
      }
      continue;
    }

    const amount = r.amount;
    const units = r.units;
    const negative = amount !== null && amount < 0 && units < 0;
    const isRedemption = /Units Extinguished/i.test(d) || /Redemption/i.test(d);
    const isCancel =
      negative && !isRedemption && (/Reversal|Rejection/i.test(d) || (!RE_DENY.test(d) && RE_PURCHASE.some((re) => re.test(d))));

    if (/Reversal|Rejection/i.test(d) && !isCancel) {
      bad(r, isRedemption && negative ? 'ambiguous reversal/redemption wording' : 'reversal/rejection row is not a negative amount and units');
      continue;
    }

    if (isCancel) {
      const net = -amount!;
      const u = -units;
      let hit: Entry | undefined;
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        if (e.kind === 'purchase' && !e.dead && sameAmount(e.net, net) && sameUnits(e.tx.units, u)) {
          // Prefer the same-date partner. An older identical purchase on another
          // date is only taken when no same-date partner follows in the folio
          // (identical SIP amounts/NAVs would otherwise cancel the wrong month).
          if (e.tx.transactionDate !== r.date) {
            const laterSameDate = folio.rows.slice(ri + 1).some(
              (x) => x.date === r.date && x.amount !== null && x.units !== null && x.amount > 0 && x.units > 0 &&
                sameAmount(x.amount, net) && sameUnits(x.units, u),
            );
            if (laterSameDate) continue;
          }
          hit = e;
          break;
        }
      }
      if (hit) {
        hit.dead = true;
        afterBad = null;
      } else if (/Reversal|Rejection/i.test(d)) {
        bad(r, 'reversal/rejection with no matching earlier purchase');
        continue;
      } else {
        pending.push({ row: r, net, units: u, date: r.date });
        afterBad = null;
      }
      prev = 'cancel';
      cancelDate = r.date;
      continue;
    }

    if (/Creation of units/i.test(d) && /Segregated/i.test(d)) {
      if (units <= 0 || amount !== null) {
        bad(r, 'segregated creation with non-positive units or an unexpected amount');
        continue;
      }
      afterBad = null;
      prev = 'other';
      entries.push({
        tx: { ...base, transactionType: 'PURCHASE', units, nav: 0, amount: 0, transactionDate: r.date },
        net: 0, kind: 'segregated', stamped: false, dead: false, row: r,
      });
      continue;
    }

    if (isRedemption) {
      if (amount === null || amount >= 0 || units >= 0 || r.nav === null) {
        bad(r, 'redemption row is not a negative amount and units with a NAV');
        continue;
      }
      afterBad = null;
      prev = 'other';
      entries.push({
        tx: { ...base, transactionType: 'REDEMPTION', units: -units, nav: r.nav, amount: -amount, transactionDate: r.date },
        net: -amount, kind: 'redemption', stamped: false, dead: false, row: r,
      });
      continue;
    }

    if (amount !== null && amount > 0 && units > 0 && r.nav !== null && !RE_DENY.test(d) && RE_PURCHASE.some((re) => re.test(d))) {
      afterBad = null;
      const entry: Entry = {
        tx: { ...base, transactionType: 'PURCHASE', units, nav: r.nav, amount, transactionDate: r.date },
        net: amount, kind: 'purchase', stamped: false, dead: false, row: r,
      };
      const pi = pending.findIndex((p) => p.date === r.date && sameAmount(p.net, amount) && sameUnits(p.units, units));
      if (pi >= 0) {
        pending.splice(pi, 1);
        entry.dead = true;
      }
      entries.push(entry);
      prev = 'purchase';
      continue;
    }

    bad(r, 'unrecognised row');
  }
  flushPending(null);

  return { transactions: entries.filter((e) => !e.dead).map((e) => e.tx), issues };
}
