import { shiftMonths } from './series';
import { TAX_RULES, type TaxRules } from './taxRules';

export type LotTxn = { date: string; type: 'buy' | 'sell'; units: number; nav: number };
export type Lot = { date: string; units: number; costNav: number };
export type TaxRegime = 'equity' | 'slab';
export type LotOpts = { taxRegime: TaxRegime; elss: boolean };
export type LotSummary = {
  units: number;
  valueInr: number;
  costInr: number;
  unrealisedGainInr: number;
  shortTermGainInr: number | null;
  longTermGainInr: number | null;
  elssLockedValueInr: number;
  elssLockedUntil: string | null;
  exitLoadWindowValueInr: number;
  taxRegime: TaxRegime;
};
export type ExitCost = {
  unitsSold: number;
  valueInr: number;
  lockedUnitsSkipped: number;
  stcgTaxInr: number | null;
  ltcgTaxInr: number | null;
  exitLoadInr: number;
  totalInr: number | null;
  note: string;
};

const EPS = 1e-9;

export function buildLots(txns: LotTxn[]): Lot[] {
  // Same-date buys are applied before sells so a same-day buy+sell nets correctly.
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'buy' ? -1 : 1));
  const lots: Lot[] = [];
  for (const t of sorted) {
    if (t.type === 'buy') {
      lots.push({ date: t.date, units: t.units, costNav: t.nav });
      continue;
    }
    let remaining = t.units;
    while (remaining > EPS && lots.length > 0) {
      const take = Math.min(remaining, lots[0].units);
      lots[0].units -= take;
      remaining -= take;
      if (lots[0].units <= EPS) lots.shift();
    }
  }
  return lots;
}

const isLongTerm = (d: string, asOf: string, r: TaxRules) => shiftMonths(d, r.equity.longTermAfterMonths) < asOf;
const isElssLocked = (d: string, asOf: string, r: TaxRules) => shiftMonths(d, r.elssLockInMonths) > asOf;
const inExitLoadWindow = (d: string, asOf: string, r: TaxRules) => shiftMonths(d, r.defaultExitLoad.withinMonths) > asOf;

export function classifyLots(lots: Lot[], nav: number, asOf: string, opts: LotOpts, rules: TaxRules = TAX_RULES): LotSummary {
  let units = 0, valueInr = 0, costInr = 0, st = 0, lt = 0, locked = 0, exitWin = 0;
  let lockedUntil: string | null = null;
  for (const l of lots) {
    const value = l.units * nav;
    const gain = l.units * (nav - l.costNav);
    units += l.units;
    valueInr += value;
    costInr += l.units * l.costNav;
    if (isLongTerm(l.date, asOf, rules)) lt += gain;
    else st += gain;
    if (opts.elss && isElssLocked(l.date, asOf, rules)) {
      locked += value;
      const until = shiftMonths(l.date, rules.elssLockInMonths);
      if (lockedUntil == null || until > lockedUntil) lockedUntil = until;
    }
    if (inExitLoadWindow(l.date, asOf, rules)) exitWin += value;
  }
  const equity = opts.taxRegime === 'equity';
  return {
    units,
    valueInr,
    costInr,
    unrealisedGainInr: valueInr - costInr,
    shortTermGainInr: equity ? st : null,
    longTermGainInr: equity ? lt : null,
    elssLockedValueInr: locked,
    elssLockedUntil: lockedUntil,
    exitLoadWindowValueInr: exitWin,
    taxRegime: opts.taxRegime,
  };
}

export function estimateExitCost(
  lots: Lot[],
  nav: number,
  asOf: string,
  opts: LotOpts & { unitsToSell?: number; exitLoadPct?: number; ltcgExemptionAvailableInr?: number },
  rules: TaxRules = TAX_RULES,
): ExitCost {
  const sellable = lots.filter((l) => !(opts.elss && isElssLocked(l.date, asOf, rules)));
  const lockedUnitsSkipped = lots.reduce((s, l) => s + l.units, 0) - sellable.reduce((s, l) => s + l.units, 0);
  let remaining = opts.unitsToSell ?? sellable.reduce((s, l) => s + l.units, 0);
  const loadPct = opts.exitLoadPct ?? rules.defaultExitLoad.pct;
  let unitsSold = 0, valueInr = 0, st = 0, lt = 0, exitLoadInr = 0;
  for (const l of sellable) {
    if (remaining <= EPS) break;
    const take = Math.min(remaining, l.units);
    const value = take * nav;
    const gain = take * (nav - l.costNav);
    unitsSold += take;
    valueInr += value;
    remaining -= take;
    if (inExitLoadWindow(l.date, asOf, rules)) exitLoadInr += (value * loadPct) / 100;
    if (isLongTerm(l.date, asOf, rules)) lt += gain;
    else st += gain;
  }
  if (opts.taxRegime === 'slab') {
    return {
      unitsSold, valueInr, lockedUnitsSkipped, stcgTaxInr: null, ltcgTaxInr: null, exitLoadInr, totalInr: null,
      note: 'Gains on this fund are taxed at your income-tax slab; tax is not estimated.',
    };
  }
  const exemption = opts.ltcgExemptionAvailableInr ?? rules.equity.longTermExemptionInrPerYear;
  const stcgTaxInr = Math.max(0, st) * rules.equity.shortTermRate;
  const ltcgTaxInr = Math.max(0, lt - exemption) * rules.equity.longTermRate;
  return {
    unitsSold, valueInr, lockedUnitsSkipped, stcgTaxInr, ltcgTaxInr, exitLoadInr,
    totalInr: stcgTaxInr + ltcgTaxInr + exitLoadInr,
    note: 'Estimate only: losses are not netted, the yearly long-term exemption is assumed unused unless stated, and the exit load assumes the typical 1% within 12 months. Verify with a tax professional before acting.',
  };
}
