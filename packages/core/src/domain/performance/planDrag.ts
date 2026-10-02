import { navOn, shiftMonths, type Series } from './series';

export function regularDirectDrag(regular: Series, direct: Series, asOf: string, years = 3): number | null {
  const start = shiftMonths(asOf, -12 * years);
  const r0 = navOn(regular, start);
  const r1 = navOn(regular, asOf);
  const d0 = navOn(direct, start);
  const d1 = navOn(direct, asOf);
  if (r0 == null || r1 == null || d0 == null || d1 == null || r0 <= 0 || r1 <= 0 || d0 <= 0) return null;
  return Math.pow(d1 / r1 / (d0 / r0), 1 / years) - 1;
}
