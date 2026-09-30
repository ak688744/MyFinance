import { navOn, shiftMonths, type Series } from './series';
import { median } from './category';

export function trailingReturn(series: Series, asOf: string, years: number): number | null {
  const end = navOn(series, asOf);
  const start = navOn(series, shiftMonths(asOf, -12 * years));
  if (end == null || start == null || start <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

/**
 * Compare `windowYears` CAGRs for windows ending at asOf, asOf-1m, ... (spanMonths windows).
 * beatPct = share of windows where the fund's CAGR exceeded the benchmark's.
 */
export function relativeRolling(
  fund: Series,
  bench: Series,
  asOf: string,
  opts: { windowYears?: number; spanMonths?: number } = {},
): { beatPct: number | null; medianExcess: number | null; windows: number } {
  const windowYears = opts.windowYears ?? 3;
  const span = opts.spanMonths ?? 24;
  const excess: number[] = [];
  let beat = 0;
  for (let k = 0; k < span; k++) {
    const end = shiftMonths(asOf, -k);
    const f = trailingReturn(fund, end, windowYears);
    const b = trailingReturn(bench, end, windowYears);
    if (f == null || b == null) continue;
    excess.push(f - b);
    if (f > b) beat += 1;
  }
  if (excess.length === 0) return { beatPct: null, medianExcess: null, windows: 0 };
  return { beatPct: beat / excess.length, medianExcess: median(excess), windows: excess.length };
}
