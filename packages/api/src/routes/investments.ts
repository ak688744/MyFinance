import type { FastifyInstance } from 'fastify';
import {
  getPortfolioSummary,
  getPeriodReturns,
  getLatestNAV,
  getNAVForDate,
  getHoldings,
  getAssetAllocation,
  getAccounts,
  ingestFundData,
  fetchGrowwFundData,
  fetchTickertapeFundData,
  fetchKuveraFundData,
  type NavLookup,
  type Period,
  type FundDataSource,
} from '@myfinance/core';
import { badRequest } from '../errors';
import { makeRunInTransaction } from '../plugins/txRunner';
import {
  getFundDataCoverage,
  getInvestmentInsights,
  getAnalysis,
} from '../lib/investmentAnalysisService';

const VALID_PERIODS: readonly Period[] = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'];

function isPeriod(value: string | undefined): value is Period {
  return value !== undefined && (VALID_PERIODS as readonly string[]).includes(value);
}

/**
 * NAV dependency built from the real core nav service. The domain code only
 * calls these when a scheme has a non-null amfi_code, so for schemes without an
 * amfi code (as seeded in tests) these are never invoked — no network in tests.
 */
const nav: NavLookup = {
  getNAVForDate: (amfiCode, date) => getNAVForDate(amfiCode, date),
  getLatestNAV: (amfiCode) => getLatestNAV(amfiCode),
};

function portfolioDeps(app: FastifyInstance) {
  return {
    txRepo: app.repos.txRepo,
    holdingsRepo: app.repos.holdingsRepo,
    nav,
  };
}

export type FundDataIngestResult = {
  schemeId: number;
  source: string;
  asOfDate: string;
  holdingsCount: number;
};

export type FundData = (
  amfiCode: string,
  ctx: { isin?: string | null; schemeName?: string },
) => Promise<FundDataIngestResult>;

export type InvestmentRoutesOpts = { fundData?: FundData };

function makeDefaultFundData(app: FastifyInstance): FundData {
  const runInTransaction = makeRunInTransaction(app.sqlite);
  return (amfiCode, _ctx) =>
    ingestFundData(
      {
        schemeRepo: app.repos.schemeRepo,
        fundamentalsRepo: app.repos.schemeFundamentalsRepo,
        holdingsRepo: app.repos.schemeHoldingsRepo,
        runInTransaction,
        adapters: [
          { source: 'groww', fetch: (code, fetchCtx) => fetchGrowwFundData(code, fetchCtx) },
          {
            source: 'tickertape',
            fetch: (code, fetchCtx) => fetchTickertapeFundData(code, fetchCtx),
          },
          { source: 'kuvera', fetch: (code, fetchCtx) => fetchKuveraFundData(code, fetchCtx) },
        ],
      },
      amfiCode,
    );
}

async function ownedAmfiCodes(app: FastifyInstance, account?: string): Promise<
  { schemeId: number; amfiCode: string; schemeName: string }[]
> {
  const holdings = await getHoldings(portfolioDeps(app), account ? { account } : {});
  const seen = new Set<number>();
  const out: { schemeId: number; amfiCode: string; schemeName: string }[] = [];
  for (const h of holdings) {
    if (h.schemeId == null || seen.has(h.schemeId)) continue;
    seen.add(h.schemeId);
    const scheme = app.repos.schemeRepo.getSchemeById(h.schemeId);
    if (scheme?.amfiCode) {
      out.push({
        schemeId: h.schemeId,
        amfiCode: scheme.amfiCode,
        schemeName: h.schemeName,
      });
    }
  }
  return out;
}

type ReturnsQuery = { period?: string };

export async function investmentRoutes(
  app: FastifyInstance,
  opts: InvestmentRoutesOpts = {},
): Promise<void> {
  const fundData = opts.fundData ?? makeDefaultFundData(app);

  // GET /investments/summary?account= — lifetime portfolio summary (optional account filter).
  app.get<{ Querystring: { account?: string } }>('/investments/summary', async (req) => {
    const filters = req.query.account ? { account: req.query.account } : undefined;
    const summary = await getPortfolioSummary(portfolioDeps(app), filters);
    return { data: summary };
  });

  // GET /investments/returns?period=1Y — period returns; invalid period -> 400.
  app.get<{ Querystring: ReturnsQuery }>('/investments/returns', async (req) => {
    const period = req.query.period;
    if (!isPeriod(period)) {
      throw badRequest(
        `Invalid period: ${String(period)}. Expected one of ${VALID_PERIODS.join(', ')}.`,
      );
    }

    const returns = await getPeriodReturns(
      {
        txRepo: app.repos.txRepo,
        schemeRepo: app.repos.schemeRepo,
        holdingsRepo: app.repos.holdingsRepo,
        nav,
      },
      { period },
    );
    return { data: returns };
  });

  // GET /investments/holdings?account&sortBy&sortOrder
  app.get<{ Querystring: { account?: string; sortBy?: string; sortOrder?: string } }>(
    '/investments/holdings',
    async (req) => {
      const { account, sortBy, sortOrder } = req.query;
      const filters = {
        ...(account ? { account } : {}),
        ...(sortBy ? { sortBy: sortBy as any } : {}),
        ...(sortOrder ? { sortOrder: sortOrder as any } : {}),
      };
      const holdings = await getHoldings(portfolioDeps(app), filters);
      return { data: holdings };
    },
  );

  // GET /investments/allocation?account
  app.get<{ Querystring: { account?: string } }>('/investments/allocation', async (req) => {
    const filters = req.query.account ? { account: req.query.account } : undefined;
    const allocation = await getAssetAllocation(portfolioDeps(app), filters);
    return { data: allocation };
  });

  // GET /investments/accounts — MF transaction names ∪ manual investment account labels
  app.get('/investments/accounts', async () => {
    const mf = getAccounts({ txRepo: app.repos.txRepo });
    const manual = app.repos.accountRepo
      .list({ domain: 'investment' })
      .map((a) => a.label);
    const data = [...new Set([...mf, ...manual])].sort((a, b) => a.localeCompare(b));
    return { data };
  });

  // GET /investments/fund-data/coverage?account=
  app.get<{ Querystring: { account?: string } }>(
    '/investments/fund-data/coverage',
    async (req) => {
      const data = await getFundDataCoverage(app.repos, req.query.account);
      return { data };
    },
  );

  // GET /investments/analysis/overlap|lookthrough|concentration|insights?account=
  app.get<{ Querystring: { account?: string } }>(
    '/investments/analysis/overlap',
    async (req) => {
      const data = await getAnalysis(app.repos, 'overlap', req.query.account);
      return { data };
    },
  );

  app.get<{ Querystring: { account?: string } }>(
    '/investments/analysis/lookthrough',
    async (req) => {
      const data = await getAnalysis(app.repos, 'lookthrough', req.query.account);
      return { data };
    },
  );

  app.get<{ Querystring: { account?: string } }>(
    '/investments/analysis/concentration',
    async (req) => {
      const data = await getAnalysis(app.repos, 'concentration', req.query.account);
      return { data };
    },
  );

  app.get<{ Querystring: { account?: string; horizonYears?: string; riskTolerance?: string } }>(
    '/investments/analysis/insights',
    async (req) => {
      const profile =
        req.query.horizonYears != null && req.query.riskTolerance != null
          ? {
              horizonYears: Number(req.query.horizonYears),
              riskTolerance: req.query.riskTolerance as 'low' | 'medium' | 'high',
            }
          : null;
      const data = await getInvestmentInsights(app.repos, req.query.account, profile);
      return { data };
    },
  );

  // POST /investments/fund-data/refresh — single AMFI code or all owned
  app.post<{
    Body: { amfiCode?: string; all?: boolean; source?: FundDataSource; account?: string };
  }>('/investments/fund-data/refresh', async (req) => {
    const { amfiCode, all, account } = req.body ?? {};
    if (!amfiCode && !all) {
      throw badRequest('Provide amfiCode or set all:true to refresh owned funds.');
    }

    if (all) {
      const owned = await ownedAmfiCodes(app, account);
      const results: FundDataIngestResult[] = [];
      for (const o of owned) {
        results.push(
          await fundData(o.amfiCode, { schemeName: o.schemeName }),
        );
      }
      return { data: { refreshed: results.length, results } };
    }

    const result = await fundData(amfiCode!, {});
    return { data: result };
  });
}
