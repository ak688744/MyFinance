import { navOn, shiftMonths, type Series } from './series';

export function maxDrawdown(series: Series, from: string, to: string): number | null {
  let peak = -Infinity;
  let worst = 0;
  let seen = 0;
  for (const p of series) {
    if (p.date < from || p.date > to) continue;
    seen += 1;
    peak = Math.max(peak, p.nav);
    worst = Math.min(worst, p.nav / peak - 1);
  }
  return seen >= 2 ? worst : null;
}

export function annualVol(monthly: Series, asOf: string, years: number): number | null {
  const from = shiftMonths(asOf, -12 * years);
  const pts = monthly.filter((p) => p.date >= from && p.date <= asOf);
  const logs: number[] = [];
  for (let i = 1; i < pts.length; i++) logs.push(Math.log(pts[i].nav / pts[i - 1].nav));
  if (logs.length < 6) return null;
  const mean = logs.reduce((s, x) => s + x, 0) / logs.length;
  const variance = logs.reduce((s, x) => s + (x - mean) ** 2, 0) / logs.length;
  return Math.sqrt(variance) * Math.sqrt(12);
}

/** Sum of fund returns over sum of benchmark returns, in up months and in down months (monthly steps). */
export function captureRatios(fund: Series, bench: Series, asOf: string, years: number): { up: number | null; down: number | null } {
  const from = shiftMonths(asOf, -12 * years);
  const b = bench.filter((p) => p.date >= from && p.date <= asOf);
  let upF = 0, upB = 0, dnF = 0, dnB = 0;
  for (let i = 1; i < b.length; i++) {
    const f0 = navOn(fund, b[i - 1].date);
    const f1 = navOn(fund, b[i].date);
    if (f0 == null || f1 == null) continue;
    const rb = b[i].nav / b[i - 1].nav - 1;
    const rf = f1 / f0 - 1;
    if (rb > 0) { upF += rf; upB += rb; }
    else if (rb < 0) { dnF += rf; dnB += rb; }
  }
  return { up: upB !== 0 ? upF / upB : null, down: dnB !== 0 ? dnF / dnB : null };
}
