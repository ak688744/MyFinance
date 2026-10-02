import { calculateXIRR } from '../xirr';
import type { CashFlow } from '../../types';
import { navOn, type Series } from './series';

export type FlowTxn = { date: string; type: 'buy' | 'sell'; amountInr: number };
export type ReplayResult = {
  actualXirr: number | null;
  replayXirr: number | null;
  actualValueInr: number;
  replayValueInr: number;
  diffInr: number;
};

/**
 * Replays the user's actual cash flows into `target` (a benchmark proxy or another fund).
 * Buys add target units at that date's NAV; sells remove units worth the same rupees.
 * XIRR is the existing, Groww-validated core function (imported, never modified).
 */
export function replayCashflows(
  txns: FlowTxn[],
  target: Series,
  asOf: string,
  actualValueInr: number,
): ReplayResult | { unavailable: string } {
  if (txns.length === 0) return { unavailable: 'no transactions' };
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));
  let units = 0;
  const flows: CashFlow[] = [];
  for (const t of sorted) {
    const nav = navOn(target, t.date);
    if (nav == null) return { unavailable: `benchmark has no NAV near ${t.date}` };
    if (t.type === 'buy') {
      units += t.amountInr / nav;
      flows.push({ date: t.date, amount: -t.amountInr });
    } else {
      units -= t.amountInr / nav;
      flows.push({ date: t.date, amount: t.amountInr });
    }
  }
  const endNav = navOn(target, asOf);
  if (endNav == null) return { unavailable: 'benchmark has no NAV at the as-of date' };
  const replayValueInr = units * endNav;
  return {
    actualXirr: calculateXIRR([...flows, { date: asOf, amount: actualValueInr }]),
    replayXirr: calculateXIRR([...flows, { date: asOf, amount: replayValueInr }]),
    actualValueInr,
    replayValueInr,
    diffInr: actualValueInr - replayValueInr,
  };
}
