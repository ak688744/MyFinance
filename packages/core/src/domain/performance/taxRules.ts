export type TaxRules = {
  effectiveFrom: string;
  equity: { shortTermRate: number; longTermRate: number; longTermAfterMonths: number; longTermExemptionInrPerYear: number };
  elssLockInMonths: number;
  defaultExitLoad: { pct: number; withinMonths: number };
};

/**
 * Indian equity-MF capital-gains rules in force from 2024-07-23 (Union Budget 2024).
 * Update the whole object, with a new effectiveFrom, whenever a Budget changes them.
 * Outputs built on these must tell the user to verify with a tax professional.
 */
export const TAX_RULES: TaxRules = {
  effectiveFrom: '2024-07-23',
  equity: { shortTermRate: 0.2, longTermRate: 0.125, longTermAfterMonths: 12, longTermExemptionInrPerYear: 125_000 },
  elssLockInMonths: 36,
  defaultExitLoad: { pct: 1, withinMonths: 12 },
};
