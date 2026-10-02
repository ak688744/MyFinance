import {
  getHoldings,
  getLatestNAV,
  getNAVForDate,
  computeInvestmentInsights,
  fundOverlap,
  overlapMatrix,
  portfolioLookthrough,
  portfolioConcentration,
  detectRedundancy,
  portfolioCost,
  checkGoalFit,
  type OwnedFund,
  type InvestmentInsight,
} from '@myfinance/core';
import type { NavLookup } from '@myfinance/core';
import type { Repos } from '../plugins/db';

const nav: NavLookup = {
  getNAVForDate: (amfiCode, date) => getNAVForDate(amfiCode, date),
  getLatestNAV: (amfiCode) => getLatestNAV(amfiCode),
};

export type FundDataCoverage = {
  schemeId: number;
  schemeName: string;
  amfiCode: string | null;
  hasHoldings: boolean;
  asOfDate: string | null;
  staleMonths: number | null;
  hasFundamentals: boolean;
  ageDays: number | null;
  /** False when there is no AMFI code, so a refresh can never succeed. */
  refreshable: boolean;
};

export type AnalysisKind = 'overlap' | 'lookthrough' | 'concentration' | 'redundancy' | 'cost' | 'goalFit';

function monthsSince(isoDate: string): number {
  const d = new Date(isoDate);
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}

function portfolioDeps(repos: Repos, navLookup: NavLookup = nav) {
  return {
    txRepo: repos.txRepo,
    holdingsRepo: repos.holdingsRepo,
    nav: navLookup,
  };
}

export async function buildOwnedFunds(repos: Repos, account?: string, navLookup: NavLookup = nav): Promise<OwnedFund[]> {
  const filters = account ? { account } : {};
  const holdings = await getHoldings(portfolioDeps(repos, navLookup), filters);

  const byScheme = new Map<number, (typeof holdings)[number]>();
  for (const h of holdings) {
    if (h.schemeId != null && !byScheme.has(h.schemeId)) {
      byScheme.set(h.schemeId, h);
    }
  }

  const funds: OwnedFund[] = [];
  for (const [schemeId, holding] of byScheme) {
    const snapshot = repos.schemeHoldingsRepo.getLatestSnapshot(schemeId);
    const fundamentals = repos.schemeFundamentalsRepo.get(schemeId);
    funds.push({
      schemeId,
      schemeName: holding.schemeName,
      category: holding.category,
      currentValueInr: holding.currentValue,
      planType: fundamentals?.planType ?? null,
      expenseRatioDirect: fundamentals?.expenseRatioDirect ?? null,
      expenseRatioRegular: fundamentals?.expenseRatioRegular ?? null,
      holdings: snapshot.map((row) => ({
        securityName: row.securityName,
        isin: row.isin,
        weightPct: row.weightPct,
        sector: row.sector,
        marketCapBucket: row.marketCapBucket,
      })),
    });
  }

  return funds;
}

export async function getFundDataCoverage(
  repos: Repos,
  account?: string,
): Promise<FundDataCoverage[]> {
  const filters = account ? { account } : {};
  const holdings = await getHoldings(portfolioDeps(repos), filters);
  const byScheme = new Map<number, (typeof holdings)[number]>();
  for (const h of holdings) {
    if (h.schemeId != null && !byScheme.has(h.schemeId)) {
      byScheme.set(h.schemeId, h);
    }
  }

  return [...byScheme.entries()].map(([schemeId, holding]) => {
    const snapshot = repos.schemeHoldingsRepo.getLatestSnapshot(schemeId);
    const asOfDate = snapshot.length > 0 ? snapshot[0].asOfDate : null;
    const scheme = repos.schemeRepo.getSchemeById(schemeId);
    return {
      schemeId,
      schemeName: holding.schemeName,
      amfiCode: scheme?.amfiCode ?? null,
      hasHoldings: snapshot.length > 0,
      asOfDate,
      staleMonths: asOfDate != null ? monthsSince(asOfDate) : null,
      ageDays: asOfDate != null ? daysSince(asOfDate) : null,
      refreshable: scheme?.amfiCode != null,
      hasFundamentals: repos.schemeFundamentalsRepo.get(schemeId) != null,
    };
  });
}

export async function getInvestmentInsights(
  repos: Repos,
  account?: string,
  profile?: { horizonYears: number; riskTolerance: 'low' | 'medium' | 'high' } | null,
): Promise<InvestmentInsight[]> {
  const funds = await buildOwnedFunds(repos, account);
  return computeInvestmentInsights({ funds, profile: profile ?? null });
}

export async function getAnalysis(
  repos: Repos,
  kind: AnalysisKind,
  account?: string,
  profile?: { horizonYears: number; riskTolerance: 'low' | 'medium' | 'high' },
) {
  const funds = await buildOwnedFunds(repos, account);
  switch (kind) {
    case 'overlap': {
      const pairs = overlapMatrix(funds);
      return pairs.map((p) => {
        const a = funds.find((f) => f.schemeId === p.schemeIdA)!;
        const b = funds.find((f) => f.schemeId === p.schemeIdB)!;
        return { ...p, ...fundOverlap(a, b) };
      });
    }
    case 'lookthrough':
      return portfolioLookthrough(funds);
    case 'concentration':
      return portfolioConcentration(funds);
    case 'redundancy':
      return detectRedundancy(funds);
    case 'cost':
      return portfolioCost(funds);
    case 'goalFit':
      if (!profile) {
        throw new Error('goalFit analysis requires horizonYears and riskTolerance.');
      }
      return checkGoalFit(funds, profile);
    default:
      throw new Error(`Unknown analysis kind: ${kind satisfies never}`);
  }
}
