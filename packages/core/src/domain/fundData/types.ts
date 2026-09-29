import { z } from 'zod';
import type { FetchedFundData, FundDataSource } from '../../types';

export const MarketCapBucketSchema = z.enum(['large', 'mid', 'small', 'other']);

/**
 * Parse a possibly-messy value (string/number/"N/A"/undefined) to a finite
 * number, else null. Unofficial-platform JSON is untrusted and its shapes
 * change, so every numeric field must guard against NaN/Infinity — a bare
 * `Number("N/A")` is `NaN`, which `z.number()` would otherwise accept and let
 * pollute the analysis math + the DB.
 */
export function toFiniteOrNull(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Parse a weight/percentage; non-finite input becomes 0 (aggregation-safe). */
export function toWeightPct(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export const FetchedFundDataSchema = z.object({
  fundamentals: z.object({
    expenseRatioDirect: z.number().finite().nullable(),
    expenseRatioRegular: z.number().finite().nullable(),
    planType: z.enum(['direct', 'regular', 'unknown']).nullable(),
    aum: z.number().finite().nullable(),
    benchmarkName: z.string().nullable(),
    stdDev: z.number().finite().nullable(),
    sharpe: z.number().finite().nullable(),
    beta: z.number().finite().nullable(),
    alpha: z.number().finite().nullable(),
    source: z.string(),
  }),
  holdings: z.array(z.object({
    securityName: z.string().min(1),
    isin: z.string().nullable(),
    weightPct: z.number().finite(),
    sector: z.string().nullable(),
    marketCapBucket: MarketCapBucketSchema.nullable(),
  })),
  asOfDate: z.string(),
  source: z.enum(['groww', 'tickertape', 'kuvera']),
});

export type FundDataAdapter = (
  amfiCode: string,
  ctx: { isin?: string | null; schemeName?: string },
) => Promise<FetchedFundData>;

export type { FetchedFundData, FundDataSource };
