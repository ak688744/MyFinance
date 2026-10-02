import { z } from 'zod';
import {
  calculateXIRR, trailingReturn, relativeRolling, maxDrawdown, annualVol, captureRatios,
  quantiles, percentileOf, regularDirectDrag, replayCashflows,
} from '@myfinance/core';

const Date_ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dates are YYYY-MM-DD strings');
const Series = z.array(z.object({ date: Date_, nav: z.number().finite() }));
const Num = z.number().finite();
const Flows = z.array(z.object({ date: Date_, amount: Num }));
const FlowTxns = z.array(z.object({ date: Date_, type: z.enum(['buy', 'sell']), amountInr: Num }));

type Spec = { args: z.ZodTypeAny; run: (a: any[]) => unknown; doc: string };

const FUNCTIONS: Record<string, Spec> = {
  xirr: { args: z.tuple([Flows]), run: ([f]) => calculateXIRR(f), doc: 'xirr(flows) -> fraction | None; flows = [{"date","amount"}], investments negative' },
  trailing_return: { args: z.tuple([Series, Date_, Num]), run: ([s, d, y]) => trailingReturn(s, d, y), doc: 'trailing_return(series, as_of, years) -> annualised fraction | None' },
  relative_rolling: {
    args: z.tuple([Series, Series, Date_]).rest(z.union([Num, z.null()])),
    run: ([f, b, d, windowYears, spanMonths]) => relativeRolling(f, b, d, { windowYears: windowYears ?? undefined, spanMonths: spanMonths ?? undefined }),
    doc: 'relative_rolling(fund, bench, as_of, window_years=3, span_months=None) -> {"beatPct","medianExcess","windows"}',
  },
  max_drawdown: { args: z.tuple([Series, Date_, Date_]), run: ([s, a, b]) => maxDrawdown(s, a, b), doc: 'max_drawdown(series, from_date, to_date) -> fraction (negative) | None' },
  annual_vol: { args: z.tuple([Series, Date_, Num]), run: ([s, d, y]) => annualVol(s, d, y), doc: 'annual_vol(monthly_series, as_of, years) -> fraction | None' },
  capture_ratios: { args: z.tuple([Series, Series, Date_, Num]), run: ([f, b, d, y]) => captureRatios(f, b, d, y), doc: 'capture_ratios(fund, bench, as_of, years) -> {"up","down"}' },
  quantiles: { args: z.tuple([z.array(Num)]), run: ([v]) => quantiles(v), doc: 'quantiles(values) -> {"p25","median","p75","n"} | None' },
  percentile_of: { args: z.tuple([Num, z.array(Num)]), run: ([x, v]) => percentileOf(x, v), doc: 'percentile_of(value, values) -> fraction 0..1 of values below value | None' },
  regular_direct_drag: {
    args: z.tuple([Series, Series, Date_]).rest(Num),
    run: ([r, d, a, y]) => regularDirectDrag(r, d, a, y ?? 3),
    doc: 'regular_direct_drag(regular_series, direct_series, as_of, years=3) -> yearly fraction | None',
  },
  replay_cashflows: {
    args: z.tuple([FlowTxns, Series, Date_, Num]),
    run: ([t, s, d, v]) => replayCashflows(t, s, d, v),
    doc: 'replay_cashflows(flows, target_series, as_of, actual_value_inr) -> {"actualXirr","replayXirr","actualValueInr","replayValueInr","diffInr"} | {"unavailable"}; flows = [{"date","type":"buy"|"sell","amountInr"}]',
  },
};

export const BRIDGE_FUNCTION_NAMES: readonly string[] = Object.keys(FUNCTIONS);

export const BRIDGE_DOCS = BRIDGE_FUNCTION_NAMES.map((n) => `- myfinance.${FUNCTIONS[n].doc}`).join('\n')
  + '\nSeries are [{"date": "YYYY-MM-DD", "nav": number}] sorted ascending. Returns are fractions (0.114 = 11.4%). Call with await.';

export async function handleBridgeCall(fn: string, argsJson: string): Promise<string> {
  const spec = Object.prototype.hasOwnProperty.call(FUNCTIONS, fn) ? FUNCTIONS[fn] : undefined;
  if (!spec) throw new Error(`myfinance: unknown function ${fn}`);
  let raw: unknown;
  try { raw = JSON.parse(argsJson); } catch { throw new Error(`myfinance.${fn}: arguments are not valid JSON`); }
  const parsed = spec.args.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`myfinance.${fn}: argument ${issue?.path.join('.') || '?'}: ${issue?.message ?? 'invalid'}`);
  }
  return JSON.stringify(spec.run(parsed.data as unknown[]) ?? null);
}
