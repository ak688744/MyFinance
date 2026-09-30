function quantileSorted(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return quantileSorted(sorted, 0.5);
}

export function quantiles(values: number[]): { p25: number; median: number; p75: number; n: number } | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  return { p25: quantileSorted(v, 0.25), median: quantileSorted(v, 0.5), p75: quantileSorted(v, 0.75), n: v.length };
}

export function percentileOf(value: number | null | undefined, values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (value == null || !Number.isFinite(value) || v.length === 0) return null;
  return v.filter((x) => x < value).length / v.length;
}
