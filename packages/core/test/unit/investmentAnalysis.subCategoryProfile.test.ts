import { describe, it, expect } from 'vitest';
import { inferSubCategory } from '../../src/domain/investmentAnalysis/subCategory';
import { inferPortfolioProfile } from '../../src/domain/investmentAnalysis/profile';
import { detectRedundancy } from '../../src/domain/investmentAnalysis/redundancy';
import { computeInvestmentInsights } from '../../src/domain/investmentAnalysis/insights';
import type { OwnedFund } from '../../src/domain/investmentAnalysis/types';

const fund = (
  id: number, name: string, category: OwnedFund['category'], value: number,
  hs: [string, number, 'large' | 'mid' | 'small' | null][] = [],
): OwnedFund => ({
  schemeId: id, schemeName: name, category, currentValueInr: value, planType: 'direct',
  expenseRatioDirect: 0.5, expenseRatioRegular: 1,
  holdings: hs.map(([n, w, cap]) => ({ securityName: n, isin: null, weightPct: w, sector: null, marketCapBucket: cap })),
});

describe('inferSubCategory', () => {
  it.each([
    ['Nippon India Small Cap Fund Direct Growth', 'small_cap'],
    ['Motilal Oswal Midcap Fund Direct Growth', 'mid_cap'],
    ['Axis Large Cap Fund Direct Growth', 'large_cap'],
    ['Parag Parikh Flexi Cap Fund Direct Growth', 'flexi_cap'],
    ['Axis ELSS Tax Saver Direct Plan Growth', 'elss'],
    ['Parag Parikh ELSS Tax Saver Fund Direct Growth', 'elss'],
    ['Axis Nifty 50 Index Fund Direct Growth', 'index'],
    ['Invesco India Arbitrage Fund Direct Growth', 'arbitrage'],
    ['Axis Ultra Short Duration Fund Direct Growth', 'short_debt'],
    ['Nifty Midcap 150 Index Fund', 'index'],
  ])('%s -> %s', (name, key) => {
    expect(inferSubCategory(name)?.key).toBe(key);
  });
  it('returns null when nothing is recognisable', () => {
    expect(inferSubCategory('Mystery Growth Fund')).toBeNull();
  });
});

describe('redundantGroups', () => {
  const holdings: [string, number, null][] = [['HDFC', 60, null], ['ICICI', 30, null]];
  it('groups same-sub-category funds that overlap heavily', () => {
    const r = detectRedundancy([
      fund(1, 'Alpha Small Cap Fund', 'equity', 100_000, holdings),
      fund(2, 'Beta Small Cap Fund', 'equity', 50_000, holdings),
    ]);
    expect(r.redundantGroups).toHaveLength(1);
    expect(r.redundantGroups[0].subCategory).toBe('small_cap');
    expect(r.redundantGroups[0].duplicatedInr).toBeCloseTo(0.9 * 50_000);
  });
  it('ignores heavy overlap across different sub-categories', () => {
    const r = detectRedundancy([
      fund(1, 'Alpha Large Cap Fund', 'equity', 100_000, holdings),
      fund(2, 'Beta Small Cap Fund', 'equity', 50_000, holdings),
    ]);
    expect(r.redundantGroups).toHaveLength(0);
  });
  it('ignores same-sub-category funds that do not overlap', () => {
    const r = detectRedundancy([
      fund(1, 'Alpha Small Cap Fund', 'equity', 100_000, [['HDFC', 60, null]]),
      fund(2, 'Beta Small Cap Fund', 'equity', 50_000, [['TCS', 60, null]]),
    ]);
    expect(r.redundantGroups).toHaveLength(0);
  });
});

describe('insights: redundancy and profile', () => {
  const holdings: [string, number, null][] = [['HDFC', 60, null], ['ICICI', 30, null]];
  it('emits one grouped card for same-sub-category redundancy instead of a pair card', () => {
    const insights = computeInvestmentInsights({
      funds: [
        fund(1, 'Alpha Small Cap Fund', 'equity', 100_000, holdings),
        fund(2, 'Beta Small Cap Fund', 'equity', 100_000, holdings),
      ],
    });
    expect(insights.filter((i) => i.kind === 'over_diversification')).toHaveLength(1);
    expect(insights.find((i) => i.kind === 'over_diversification')!.title).toContain('small-cap');
    expect(insights.filter((i) => i.kind === 'high_overlap')).toHaveLength(0);
  });
  it('keeps the pair card for heavy overlap across sub-categories', () => {
    const insights = computeInvestmentInsights({
      funds: [
        fund(1, 'Alpha Large Cap Fund', 'equity', 100_000, holdings),
        fund(2, 'Beta Small Cap Fund', 'equity', 100_000, holdings),
      ],
    });
    expect(insights.filter((i) => i.kind === 'high_overlap')).toHaveLength(1);
    expect(insights.filter((i) => i.kind === 'over_diversification')).toHaveLength(0);
  });
  it('no longer flags a plain count of equity funds', () => {
    const funds = [1, 2, 3, 4].map((i) => fund(i, `Fund ${i} Cap Fund`, 'equity', 1000, [[`S${i}`, 50, null]]));
    expect(computeInvestmentInsights({ funds }).filter((i) => i.kind === 'over_diversification')).toHaveLength(0);
  });
  it('emits an inferred-profile card labelled as inferred', () => {
    const insights = computeInvestmentInsights({
      funds: [
        fund(1, 'Alpha Small Cap Fund', 'equity', 60_000),
        fund(2, 'Beta Large Cap Fund', 'equity', 40_000),
      ],
    });
    const p = insights.find((i) => i.kind === 'portfolio_profile')!;
    expect(p.detail).toContain('Inferred from your holdings');
    expect(p.title).toContain('aggressive');
    expect(p.detail).toContain('60%');
  });
});

describe('inferPortfolioProfile', () => {
  it('is null for an empty portfolio', () => {
    expect(inferPortfolioProfile([])).toBeNull();
  });
  it('labels a debt-heavy portfolio conservative', () => {
    const p = inferPortfolioProfile([
      fund(1, 'X Equity Fund', 'equity', 20_000),
      fund(2, 'Y Debt Fund', 'debt', 80_000),
    ])!;
    expect(p.label).toContain('conservative');
    expect(p.smallMidPctOfEquity).toBe(0);
  });
  it('labels a mixed portfolio balanced', () => {
    expect(inferPortfolioProfile([
      fund(1, 'X Equity Fund', 'equity', 55_000),
      fund(2, 'Y Debt Fund', 'debt', 45_000),
    ])!.label).toBe('balanced');
  });
});
