/** Browser-safe copy of core computeEmi — do not import @myfinance/core runtime in web. */
export function computeEmi(
  principal: number,
  annualRate: number,
  tenureMonths: number,
): number {
  const i = annualRate / 12 / 100;
  if (i === 0) return principal / tenureMonths;
  const f = Math.pow(1 + i, tenureMonths);
  return (principal * i * f) / (f - 1);
}
