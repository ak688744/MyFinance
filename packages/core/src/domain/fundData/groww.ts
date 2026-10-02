import type { FundDataAdapter } from './types';
import { FetchedFundDataSchema, toFiniteOrNull, toWeightPct } from './types';
import { pickGrowwSlug, growwSearchQueries } from './resolve';
import type { FetchedFundData, MarketCapBucket } from '../../types';

const GROWW_BASE = 'https://groww.in/mutual-funds';

function bucketFrom(raw: string | null | undefined): MarketCapBucket | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('large')) return 'large';
  if (s.includes('mid')) return 'mid';
  if (s.includes('small')) return 'small';
  return 'other';
}

function parsePlanType(schemeName: string | undefined): 'direct' | 'regular' | 'unknown' | null {
  if (!schemeName) return null;
  const s = schemeName.toLowerCase();
  if (s.includes('direct')) return 'direct';
  if (s.includes('regular')) return 'regular';
  return 'unknown';
}

/** Pure — parse Groww __NEXT_DATA__ JSON into normalized fund data. */
export function parseGrowwFundData(json: unknown, _amfiCode: string): FetchedFundData {
  const root = json as Record<string, unknown>;
  const pp = (root?.props as Record<string, unknown>)?.pageProps as Record<string, unknown> | undefined;
  const mf = (pp?.mfServerSideData ?? {}) as Record<string, unknown>;

  const holdingsRaw = (mf.holdings ?? []) as Array<Record<string, unknown>>;
  const holdings = holdingsRaw.map((h) => ({
    securityName: String(h.company_name ?? h.name ?? '').trim(),
    isin: (h.isin as string | null) ?? null,
    weightPct: toWeightPct(h.corpus_per ?? h.holdingPercentage ?? h.weightage ?? 0),
    sector: (h.sector_name as string | null) ?? (h.sector as string | null) ?? null,
    marketCapBucket: bucketFrom((h.rating_market_cap as string | null) ?? (h.market_cap as string | null)),
  })).filter((h) => h.securityName.length > 0);

  const returnStats = ((mf.return_stats ?? []) as Array<Record<string, unknown>>)[0] ?? {};
  const portfolioDate = holdingsRaw[0]?.portfolio_date as string | undefined;
  const asOfDate = portfolioDate
    ? portfolioDate.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const result: FetchedFundData = {
    source: 'groww',
    asOfDate,
    fundamentals: {
      expenseRatioDirect: toFiniteOrNull(mf.expense_ratio),
      expenseRatioRegular: toFiniteOrNull(mf.base_expense_ratio) ?? toFiniteOrNull(mf.expense_ratio),
      planType: parsePlanType(mf.scheme_name as string | undefined),
      aum: toFiniteOrNull(mf.aum),
      benchmarkName: (mf.benchmark_name as string | null) ?? (mf.benchmark as string | null) ?? null,
      stdDev: toFiniteOrNull(returnStats.standard_deviation),
      sharpe: toFiniteOrNull(returnStats.sharpe_ratio),
      beta: toFiniteOrNull(returnStats.beta),
      alpha: toFiniteOrNull(returnStats.alpha),
      source: 'groww',
    },
    holdings,
  };
  return FetchedFundDataSchema.parse(result);
}

const GROWW_SEARCH = 'https://groww.in/v1/api/search/v3/query/global/st_query';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

/**
 * Resolve the Groww fund-page slug from the scheme name via Groww's search API.
 * Groww search returns each match with both `scheme_code` (the AMFI code) and
 * `search_id` (the slug), so we match on the AMFI code exactly. The AMFI scheme
 * name is NOT a reliable slug (a fund's Groww slug often uses its old name), so
 * a derived slug would 404 — this resolution step is required.
 */
async function resolveGrowwSlug(amfiCode: string, schemeName: string): Promise<string> {
  // Try the full name, then a plan-qualifier-trimmed query (Groww's search
  // ranks the target fund out of the window when the plan suffix is present).
  for (const query of growwSearchQueries(schemeName)) {
    const url = `${GROWW_SEARCH}?query=${encodeURIComponent(query)}&web=true`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Groww search failed: ${res.status}`);
    const slug = pickGrowwSlug(await res.json(), amfiCode);
    if (slug) return slug;
  }
  throw new Error(`Groww: no fund page found for AMFI code ${amfiCode}`);
}

export const fetchGrowwFundData: FundDataAdapter = async (amfiCode, ctx) => {
  const schemeName = ctx.schemeName ?? '';
  if (!schemeName) throw new Error('Groww fetch requires schemeName in context');
  const slug = await resolveGrowwSlug(amfiCode, schemeName);
  const res = await fetch(`${GROWW_BASE}/${slug}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Groww fetch failed: ${res.status}`);
  const html = await res.text();
  const m = html.match(/id="__NEXT_DATA__"[^>]*>(\{.*?\})<\/script>/s);
  if (!m) throw new Error('Groww: __NEXT_DATA__ not found');
  return parseGrowwFundData(JSON.parse(m[1]), amfiCode);
};
