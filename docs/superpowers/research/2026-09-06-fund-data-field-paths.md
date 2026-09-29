# Fund Data Field Paths — L4.1 Capability Probe (2026-09-06)

Captured PII-free fixtures in `packages/core/test/fixtures/fundData/`.

## Groww (`groww-fund-a.json`)

Source: `https://groww.in/mutual-funds/quant-large-cap-fund-direct-growth` (Quant Large Cap Direct — live fetch).

Embedded JSON path: `props.pageProps.mfServerSideData` (NOT top-level `pageProps`).

| Field | Path |
|-------|------|
| Holdings array | `mfServerSideData.holdings[]` |
| Security name | `holdings[].company_name` |
| Weight % | `holdings[].corpus_per` |
| Sector | `holdings[].sector_name` |
| Market cap | `holdings[].market_cap` |
| As-of date | `holdings[0].portfolio_date` (ISO) |
| Expense ratio | `mfServerSideData.expense_ratio` |
| Base/direct ER | `mfServerSideData.base_expense_ratio` |
| AUM (₹ Cr) | `mfServerSideData.aum` |
| Benchmark | `mfServerSideData.benchmark_name` |
| Plan type | `mfServerSideData.plan_type` |
| NAV date | `mfServerSideData.nav_date` |
| Stats (returns) | `mfServerSideData.stats[]` (no sharpe/beta in this payload) |
| Analysis | `mfServerSideData.analysis[]` |

Regex for HTML extraction: `id="__NEXT_DATA__"[^>]*>(\{.*?\})</script>` (nonce attribute present).

## Tickertape (`tickertape-fund-a.json`)

Source: `GET https://api.tickertape.in/mutualfunds/M_QULP/holdings` (public, no auth).

| Field | Path |
|-------|------|
| Holdings | `data.currentAllocation[]` |
| Security name | `currentAllocation[].title` |
| Weight % | `currentAllocation[].latest` (may be 0 — use `change3m` as fallback signal only) |
| Sector roll-up | `data.sectorDistribution[].holdings[]` with `{sector, value}` |
| As-of | latest `sectorDistribution[].date` (epoch ms) |

## Kuvera (`kuvera-fund-a.json`)

Live API returned 404 from this environment; fixture is synthetic but matches v5 detail shape from prior research.

| Field | Path |
|-------|------|
| Expense direct | `data.expense_ratio` |
| Expense regular | `data.expense_ratio_regular` |
| AUM | `data.aum` |
| Benchmark | `data.benchmark` |
| Risk stats | `data.risk_stats.{standard_deviation,sharpe_ratio,beta,alpha}` |
| Holdings | **none** (empty array valid) |

## Merge priority

1. Holdings: Groww primary → Tickertape fallback
2. Fundamentals: first non-null across sources (Kuvera fills expense/AUM/risk)
