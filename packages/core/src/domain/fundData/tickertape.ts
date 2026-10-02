import type { FundDataAdapter } from './types';
import { FetchedFundDataSchema, toWeightPct } from './types';
import { pickTickertapeSid } from './resolve';
import type { FetchedFundData } from '../../types';

const TICKERTAPE_BASE = 'https://api.tickertape.in/mutualfunds';
const TICKERTAPE_SEARCH = 'https://api.tickertape.in/search';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

function deriveMfId(schemeName?: string | null): string | null {
  if (!schemeName) return null;
  const parts = schemeName.trim().split(/[-\s]+/);
  const last = parts[parts.length - 1];
  if (last && /^M_[A-Z0-9]+$/i.test(last)) return last;
  return null;
}

/** Resolve a Tickertape `M_XXXX` mfId: prefer one embedded in the name, else search. */
async function resolveMfId(schemeName: string): Promise<string> {
  const embedded = deriveMfId(schemeName);
  if (embedded) return embedded;
  const url = `${TICKERTAPE_SEARCH}?text=${encodeURIComponent(schemeName)}&types=mutualfund`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Tickertape search failed: ${res.status}`);
  const sid = pickTickertapeSid(await res.json(), schemeName);
  if (!sid) throw new Error(`Tickertape: no mfId found for "${schemeName}"`);
  return sid;
}

/** Pure — parse Tickertape holdings JSON into normalized fund data. */
export function parseTickertapeFundData(json: unknown, _amfiCode: string): FetchedFundData {
  const root = json as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;

  const allocation = (data.currentAllocation ?? []) as Array<Record<string, unknown>>;

  const holdings = allocation.map((h) => {
    const title = String(h.title ?? '').trim();
    const weight = toWeightPct(h.latest ?? h.corpusPct ?? h.weight ?? 0);
    const type = (h.type as string | null) ?? null;
    return {
      securityName: title,
      isin: null,
      weightPct: weight,
      sector: type && type !== 'Equity' && type !== 'Others' ? type : null,
      marketCapBucket: null,
    };
  }).filter((h) => h.securityName.length > 0);

  const asOfDate = new Date().toISOString().slice(0, 10);

  const result: FetchedFundData = {
    source: 'tickertape',
    asOfDate,
    fundamentals: {
      expenseRatioDirect: null,
      expenseRatioRegular: null,
      planType: null,
      aum: null,
      benchmarkName: null,
      stdDev: null,
      sharpe: null,
      beta: null,
      alpha: null,
      source: 'tickertape',
    },
    holdings,
  };
  return FetchedFundDataSchema.parse(result);
}

export const fetchTickertapeFundData: FundDataAdapter = async (amfiCode, ctx) => {
  const schemeName = ctx.schemeName ?? '';
  if (!schemeName) throw new Error('Tickertape fetch requires schemeName in context');
  const mfId = await resolveMfId(schemeName);
  const res = await fetch(`${TICKERTAPE_BASE}/${mfId}/holdings`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Tickertape fetch failed: ${res.status}`);
  const json = await res.json();
  return parseTickertapeFundData(json, amfiCode);
};
