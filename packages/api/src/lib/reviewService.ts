// packages/api/src/lib/reviewService.ts
import { createHash } from 'node:crypto';
import {
  getHoldings,
  computeInvestmentInsights,
  inferPortfolioProfile,
  buildFactSheet,
  pickCandidates,
  benchmarkForFund,
  normalizeCategory,
  toMonthEnd,
  computeFundStats,
  percentileOf,
  regularDirectDrag,
  txnsToFlows,
  txnsToLots,
  taxOptsFor,
  nameTokens,
  tokenOverlap,
  LIQUID_CATEGORY,
  type Holding,
  type NavLookup,
  type NavPoint,
  type FactSheetInput,
  type OwnedPositionInput,
  type FundPerformanceRow,
  type CategoryStatRow,
  type PerformanceWithName,
  type InferredProfile,
} from '@myfinance/core';
import { runInvestmentReview, REVIEW_PROMPT_VERSION, LlmError, type ReviewCard } from '@myfinance/agents';
import type { Repos } from '../plugins/db';
import type { Gateway } from '../plugins/gateway';
import { buildOwnedFunds } from './investmentAnalysisService';

type Logger = { warn?: (o: unknown, m?: string) => void };

export type Position = { schemeId: number; schemeName: string; units: number; valueInr: number };

export type ReviewDeps = {
  nav: NavLookup;
  navHistory: (amfiCode: string, start: string, end: string) => Promise<NavPoint[]>;
  schemeInfo: (amfiCode: string) => Promise<{ category: string } | null>;
  today: () => string;
};

export type ReviewCardDTO = ReviewCard & { id: string };
export type InvestmentReviewResponse = {
  cards: ReviewCardDTO[];
  summary: string;
  asOf: string | null;
  cached: boolean;
  reviewUnavailable?: boolean;
  reason?: string;
};

const TWIN_MIN_NAME_OVERLAP = 0.6;
const HISTORY_START = '2000-01-01';

/** getHoldings returns one row per account; the review works per fund, so sum by scheme. */
export function aggregatePositions(holdings: Holding[]): Position[] {
  const by = new Map<number, Position>();
  for (const h of holdings) {
    if (h.schemeId == null) continue;
    const p = by.get(h.schemeId) ?? { schemeId: h.schemeId, schemeName: h.schemeName, units: 0, valueInr: 0 };
    p.units += h.units;
    p.valueInr += h.currentValue;
    by.set(h.schemeId, p);
  }
  return [...by.values()].filter((p) => p.units > 1e-6 && p.valueInr > 0).sort((a, b) => a.schemeId - b.schemeId);
}

/** Accounts that actually hold each scheme (units > 0), used to detect partial transaction coverage. */
export function heldAccountsByScheme(holdings: Holding[]): Map<number, Set<string>> {
  const by = new Map<number, Set<string>>();
  for (const h of holdings) {
    if (h.schemeId == null || h.units <= 1e-6) continue;
    const set = by.get(h.schemeId) ?? new Set<string>();
    set.add(h.accountName);
    by.set(h.schemeId, set);
  }
  return by;
}

const unavailable = (reason: string, asOf: string | null = null): InvestmentReviewResponse => ({
  cards: [], summary: '', asOf, cached: false, reviewUnavailable: true, reason,
});

async function assembleFactSheetInput(
  repos: Repos,
  deps: ReviewDeps,
  meta: { builtAt: string; asOf: string | null },
  positions: Position[],
  account: string | undefined,
  profile: InferredProfile | null,
  portfolioInsights: FactSheetInput['portfolioInsights'],
  heldAccounts: Map<number, Set<string>>,
): Promise<FactSheetInput> {
  const perfRepo = repos.performanceUniverseRepo;
  const today = deps.today();
  const asOf = meta.asOf ?? today;
  const ownedCodes = new Set<string>();
  const dailyCache = new Map<string, Promise<NavPoint[]>>();
  const daily = (code: string) => {
    if (!dailyCache.has(code)) dailyCache.set(code, deps.navHistory(code, HISTORY_START, today).catch(() => []));
    return dailyCache.get(code)!;
  };
  const dataQuality: FactSheetInput['dataQuality'] = [];
  const out: OwnedPositionInput[] = [];

  for (const p of positions) {
    const scheme = repos.schemeRepo.getSchemeById(p.schemeId);
    const amfi = scheme?.amfiCode ?? null;
    if (amfi) ownedCodes.add(amfi);
    const uni = amfi ? perfRepo.getFund(amfi) : null;

    let category = uni?.category ?? null;
    if (!category && amfi) {
      const info = await deps.schemeInfo(amfi).catch(() => null);
      category = info?.category ? normalizeCategory(info.category) : null;
    }
    const benchmark = category ? benchmarkForFund(category, p.schemeName) : null;
    const proxyCode = benchmark?.kind === 'proxy' ? benchmark.amfiCode : null;
    const benchmarkPerformance = proxyCode ? perfRepo.getPerformance([proxyCode])[0] ?? null : null;

    // Owned plans outside the Direct-Growth universe (e.g. a Regular plan) are measured on the fly.
    let performance: FundPerformanceRow | null = uni && amfi ? perfRepo.getPerformance([amfi])[0] ?? null : null;
    let directTwin: OwnedPositionInput['directTwin'] = null;
    if (!uni && amfi && category) {
      const own = await daily(amfi);
      if (own.length > 0) {
        const monthly = toMonthEnd(own);
        const bench = proxyCode ? perfRepo.getMonthlyNav(proxyCode) : [];
        const stats = computeFundStats({ amfiCode: amfi, monthly, bench: bench.length ? bench : null, benchmarkCode: proxyCode, asOf });
        const peers = perfRepo.listPerformanceByCategory(category).filter((r) => r.rankable);
        const vals = (k: 'r3y' | 'r5y') => peers.map((r) => r[k]).filter((v): v is number => v != null);
        performance = { ...stats, categoryPctile3y: percentileOf(stats.r3y, vals('r3y')), categoryPctile5y: percentileOf(stats.r5y, vals('r5y')) };

        const ownTokens = nameTokens(p.schemeName);
        const best = perfRepo
          .listFunds({ category })
          .map((f) => ({ f, score: tokenOverlap(ownTokens, nameTokens(f.schemeName)) }))
          .sort((a, b) => b.score - a.score)[0];
        if (best && best.score >= TWIN_MIN_NAME_OVERLAP) {
          const drag = regularDirectDrag(monthly, perfRepo.getMonthlyNav(best.f.amfiCode), asOf, 3);
          if (drag != null && drag > 0) directTwin = { amfiCode: best.f.amfiCode, schemeName: best.f.schemeName, annualDrag: drag };
        }
      }
    }

    const txns = repos.txRepo.getTransactionsByScheme(p.schemeId).filter((t) => !account || t.accountName === account);
    if (!amfi) dataQuality.push({ schemeId: p.schemeId, issue: 'No AMFI code stored, so performance could not be measured.' });
    if (txns.length === 0) dataQuality.push({ schemeId: p.schemeId, issue: 'No transactions imported, so tax, lock-in and replay could not be checked.' });

    // Replay/lots are built from transactions, but valueInr covers every held account (incl. snapshot-only ones).
    const txnAccounts = new Set(txns.map((t) => t.accountName));
    const transactionsPartial = txns.length > 0 && [...(heldAccounts.get(p.schemeId) ?? [])].some((a) => !txnAccounts.has(a));

    out.push({
      schemeId: p.schemeId,
      schemeName: p.schemeName,
      amfiCode: amfi,
      category,
      units: p.units,
      valueInr: p.valueInr,
      currentNav: p.units > 0 ? p.valueInr / p.units : null,
      performance,
      benchmark,
      benchmarkPerformance,
      benchmarkDaily: proxyCode && txns.length > 0 ? await daily(proxyCode) : null,
      flows: txnsToFlows(txns),
      lots: txnsToLots(txns),
      taxOpts: taxOptsFor(category, p.schemeName, scheme?.category ?? null),
      transactionsPartial,
      directTwin,
    });
  }

  const cats = [...new Set(out.map((o) => o.category).filter((c): c is string => !!c))];
  const categoryStats: Record<string, CategoryStatRow[]> = {};
  for (const c of [...cats, LIQUID_CATEGORY]) categoryStats[c] = perfRepo.getCategoryStats(c);
  const candidates: Record<string, PerformanceWithName[]> = {};
  for (const c of cats) candidates[c] = pickCandidates(perfRepo.listPerformanceByCategory(c), ownedCodes, 5);

  return {
    asOf,
    builtAt: meta.builtAt,
    today,
    positions: out,
    categoryStats,
    candidates,
    allCategoryStats: perfRepo.listAllCategoryStats(),
    profile: profile
      ? { label: profile.label, equityPct: profile.equityPct, smallMidPctOfEquity: profile.smallMidPctOfEquity, nonEquityPct: profile.nonEquityPct }
      : null,
    portfolioInsights,
    dataQuality,
  };
}

export async function getInvestmentReview(
  repos: Repos,
  gateway: Gateway | undefined,
  deps: ReviewDeps,
  account?: string,
  logger?: Logger,
): Promise<InvestmentReviewResponse> {
  const meta = repos.performanceUniverseRepo.getMeta();
  if (!meta) return unavailable('universe_not_built');

  const holdings = await getHoldings({ txRepo: repos.txRepo, holdingsRepo: repos.holdingsRepo, nav: deps.nav }, account ? { account } : {});
  const positions = aggregatePositions(holdings);
  if (positions.length === 0) return unavailable('no_holdings', meta.asOf);

  const funds = await buildOwnedFunds(repos, account, deps.nav);
  const profile = inferPortfolioProfile(funds);
  const signature = createHash('sha256')
    .update(JSON.stringify({
      v: REVIEW_PROMPT_VERSION,
      account: account ?? null,
      builtAt: meta.builtAt,
      positions: positions.map((p) => {
        const txns = repos.txRepo.getTransactionsByScheme(p.schemeId).filter((t) => !account || t.accountName === account);
        const latest = txns.reduce((m, t) => (t.transactionDate > m ? t.transactionDate : m), '');
        return [
          p.schemeId,
          Math.round(p.units * 100) / 100,
          repos.schemeRepo.getSchemeById(p.schemeId)?.amfiCode ?? null,
          txns.length,
          latest || null,
        ];
      }),
      fundamentals: positions.map((p) => repos.schemeFundamentalsRepo.get(p.schemeId)?.fetchedAt ?? null),
      profile: profile?.label ?? null,
    }))
    .digest('hex');

  const hit = repos.investmentReviewCacheRepo.get(signature);
  if (hit) return { ...(JSON.parse(hit.reviewJson) as InvestmentReviewResponse), cached: true };
  if (!gateway) return unavailable('ai_not_configured', meta.asOf);

  const portfolioInsights = computeInvestmentInsights({ funds, profile: null })
    .filter((i) => i.kind !== 'portfolio_profile')
    .map(({ kind, title, detail }) => ({ kind, title, detail }));
  const factSheet = buildFactSheet(await assembleFactSheetInput(repos, deps, meta, positions, account, profile, portfolioInsights, heldAccountsByScheme(holdings)));

  let outcome;
  try {
    outcome = await gateway.runTask('investment_review', (complete) =>
      runInvestmentReview(factSheet, { complete, logger: logger?.warn ? { warn: (o, m) => logger.warn!(o, m) } : undefined }));
  } catch (e) {
    logger?.warn?.({ err: (e as Error)?.message }, 'investment review failed; serving fallback');
    return unavailable(e instanceof LlmError ? e.kind : 'review_failed', meta.asOf);
  }
  if (outcome.dropped.length > 0) logger?.warn?.({ dropped: outcome.dropped }, 'investment review: cards dropped by the number guard');

  // Every card failed the number guard: do not cache an empty review or present it as "nothing needs attention".
  if (outcome.review.cards.length === 0 && outcome.dropped.length > 0) return unavailable('review_failed', meta.asOf);

  const response: InvestmentReviewResponse = {
    cards: outcome.review.cards.map((c, i) => ({ ...c, id: `review:${signature.slice(0, 10)}:${i}` })),
    summary: outcome.review.summary,
    asOf: meta.asOf,
    cached: false,
  };
  repos.investmentReviewCacheRepo.put({ signature, reviewJson: JSON.stringify(response) });
  return response;
}
