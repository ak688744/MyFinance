// packages/core/src/domain/performance/benchmarks.ts
/**
 * Benchmarks are represented by the longest-history Direct index fund tracking each index.
 * Proxies understate the index by their expense ratio (~0.1–0.3%/yr) — conservative, documented.
 */
export const BENCHMARK_PROXIES = {
  nifty50: { amfiCode: '120716', label: 'Nifty 50 (UTI Nifty 50 Index Fund as proxy)' },
  nifty100: { amfiCode: '147666', label: 'Nifty 100 (Axis Nifty 100 Index Fund as proxy)' },
  nifty500: { amfiCode: '147625', label: 'Nifty 500 (Motilal Oswal Nifty 500 Index Fund as proxy)' },
  midcap150: { amfiCode: '147622', label: 'Nifty Midcap 150 (Motilal Oswal index fund as proxy)' },
  smallcap250: { amfiCode: '147623', label: 'Nifty Smallcap 250 (Motilal Oswal index fund as proxy)' },
} as const;

type ProxyKey = keyof typeof BENCHMARK_PROXIES;
export const LIQUID_CATEGORY = 'Debt: Liquid';

export type BenchmarkRef =
  | { kind: 'proxy'; amfiCode: string; label: string }
  | { kind: 'category_median'; category: string; label: string };

const CATEGORY_BENCHMARK: Record<string, ProxyKey> = {
  'Equity: Large Cap': 'nifty100',
  'Equity: Mid Cap': 'midcap150',
  'Equity: Small Cap': 'smallcap250',
  'Equity: Flexi Cap': 'nifty500',
  'Equity: Multi Cap': 'nifty500',
  'Equity: ELSS': 'nifty500',
  'Equity: Large & Mid Cap': 'nifty500',
  'Equity: Focused': 'nifty500',
  'Equity: Value': 'nifty500',
  'Equity: Contra': 'nifty500',
  'Equity: Dividend Yield': 'nifty500',
};

function indexFundProxy(schemeName: string): ProxyKey | null {
  const n = schemeName.toLowerCase();
  if (/smallcap 250|small cap 250/.test(n)) return 'smallcap250';
  if (/midcap 150|mid cap 150/.test(n)) return 'midcap150';
  if (/nifty 500\b/.test(n)) return 'nifty500';
  if (/nifty 100\b/.test(n)) return 'nifty100';
  if (/nifty 50\b/.test(n)) return 'nifty50';
  return null;
}

const proxyRef = (key: ProxyKey): BenchmarkRef => ({ kind: 'proxy', ...BENCHMARK_PROXIES[key] });

export function benchmarkForFund(category: string, schemeName: string): BenchmarkRef | null {
  if (category === 'Other: Index Funds') {
    const key = indexFundProxy(schemeName);
    return key ? proxyRef(key) : null;
  }
  if (category === 'Hybrid: Arbitrage') {
    return { kind: 'category_median', category: LIQUID_CATEGORY, label: 'Liquid-fund category median' };
  }
  const key = CATEGORY_BENCHMARK[category];
  return key ? proxyRef(key) : null;
}

export function proxyCodes(): string[] {
  return Object.values(BENCHMARK_PROXIES).map((p) => p.amfiCode);
}
