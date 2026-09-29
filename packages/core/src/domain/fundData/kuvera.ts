import type { FundDataAdapter } from './types';
import { FetchedFundDataSchema, toFiniteOrNull } from './types';
import { pickKuveraCode } from './resolve';
import type { FetchedFundData, FundPlanType } from '../../types';

const KUVERA_LIST = 'https://api.kuvera.in/mf/api/v4/fund_schemes/list.json';
const KUVERA_DETAIL = 'https://api.kuvera.in/mf/api/v5/fund_schemes';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

function parsePlanType(raw: unknown): FundPlanType | null {
  if (raw == null) return null;
  const s = String(raw).toLowerCase();
  if (s.includes('direct')) return 'direct';
  if (s.includes('regular')) return 'regular';
  return 'unknown';
}

/**
 * Pure — parse a Kuvera v5 fund-detail response into normalized fund data.
 * The real endpoint returns a top-level ARRAY `[{ code, name, expense_ratio,
 * aum, ... }]` (Kuvera has no holdings feed → holdings stay empty). We accept
 * either the array shape or a `{ data: {...} }` wrapper defensively.
 */
export function parseKuveraFundData(json: unknown, _amfiCode: string): FetchedFundData {
  const item = (Array.isArray(json) ? json[0] : (json as any)?.data ?? json) as Record<string, unknown>;
  const name = (item?.name ?? item?.fund_name) as string | undefined;

  const result: FetchedFundData = {
    source: 'kuvera',
    asOfDate: new Date().toISOString().slice(0, 10),
    fundamentals: {
      expenseRatioDirect: toFiniteOrNull(item?.expense_ratio),
      expenseRatioRegular: toFiniteOrNull(item?.expense_ratio_regular),
      planType: parsePlanType(name ?? item?.plan_type),
      aum: toFiniteOrNull(item?.aum),
      benchmarkName: (item?.benchmark as string | null) ?? null,
      stdDev: null,
      sharpe: null,
      beta: null,
      alpha: null,
      source: 'kuvera',
    },
    holdings: [],
  };
  return FetchedFundDataSchema.parse(result);
}

export const fetchKuveraFundData: FundDataAdapter = async (amfiCode, ctx) => {
  const schemeName = ctx.schemeName ?? '';
  if (!schemeName) throw new Error('Kuvera fetch requires schemeName in context');
  const listRes = await fetch(KUVERA_LIST, { headers: { 'User-Agent': UA } });
  if (!listRes.ok) throw new Error(`Kuvera list failed: ${listRes.status}`);
  const code = pickKuveraCode(await listRes.json(), schemeName);
  if (!code) throw new Error(`Kuvera: no scheme code found for "${schemeName}"`);
  const res = await fetch(`${KUVERA_DETAIL}/${code}.json`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Kuvera fetch failed: ${res.status}`);
  return parseKuveraFundData(await res.json(), amfiCode);
};
