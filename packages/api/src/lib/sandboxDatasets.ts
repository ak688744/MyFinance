import {
  proxyCodes, performanceView, getHoldings, getNetWorth, getLatestNAV, getNAVForDate, type NavLookup,
} from '@myfinance/core';
import type { Repos } from '../plugins/db';
import { buildCurrentFactSheet, type ReviewDeps } from './reviewService';

const HISTORY_START = '2000-01-01';
// Same defaults as GET /expenses/summary: money moved, not consumed, stays out of "spent".
const EXCLUDE_FROM_SPEND = ['investment', 'self_transfer'];
const INVESTMENT_CATEGORIES = ['investment'];
const MONTH_ROW_LIMIT = 20_000;
const nav: NavLookup = {
  getNAVForDate: (code, date) => getNAVForDate(code, date),
  getLatestNAV: (code) => getLatestNAV(code),
};

function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/**
 * Resolves run_python dataset names (spec section 8) from the same repos and fetchers
 * as the investment tools. Throws Error(message) for anything it cannot serve;
 * the tool turns that into an error result.
 */
export function makeSandboxDatasetResolver(repos: Repos, deps: ReviewDeps): (name: string) => Promise<unknown> {
  const isTierC = (code: string): boolean =>
    proxyCodes().includes(code)
    || repos.schemeRepo.getSchemes().some((s) => s.amfiCode === code)
    || repos.candidateDetailsRepo.get(code) !== null;

  const daily = async (code: string) => (await deps.navHistory(code, HISTORY_START, deps.today()))
    .map((p) => ({ date: p.date, nav: p.nav }));

  return async (name: string) => {
    const navMatch = /^nav:(\d{3,8})$/.exec(name);
    const txMatch = /^transactions:(\d{1,9})$/.exec(name);
    if (navMatch) {
      const arg = navMatch[1]!;
      if (isTierC(arg)) return { code: arg, frequency: 'daily', points: await daily(arg) };
      const monthly = repos.performanceUniverseRepo.getMonthlyNav(arg);
      if (monthly.length > 0) return { code: arg, frequency: 'monthly', points: monthly.map((p) => ({ date: p.date, nav: p.nav })) };
      // By design nav:<code> may fetch public mfapi NAV history for ANY AMFI code
      // (read-only, digits only), not just owned or universe funds.
      const points = await daily(arg);
      if (points.length === 0) throw new Error(`no NAV history for ${arg}`);
      return { code: arg, frequency: 'daily', points };
    }
    if (txMatch) {
      const schemeId = Number(txMatch[1]);
      const scheme = repos.schemeRepo.getSchemeById(schemeId);
      if (!scheme) throw new Error(`No scheme with id ${schemeId}`);
      const transactions = repos.txRepo.getTransactionsByScheme(schemeId)
        .slice()
        .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate))
        .map((t) => ({ date: t.transactionDate, type: t.transactionType, units: t.units, nav: t.nav, amountInr: t.amount }));
      return { schemeId, schemeName: scheme.schemeName, amfiCode: scheme.amfiCode ?? null, transactions };
    }
    const expMatch = /^expense_transactions:(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(name);
    if (expMatch) {
      const month = expMatch[1]!;
      const rows = repos.expenseTxRepo.query({ ...monthBounds(month), limit: MONTH_ROW_LIMIT });
      return { month, transactions: rows };
    }
    if (name === 'expense_summary') {
      return repos.expenseTxRepo.summary({
        excludeFromSpend: EXCLUDE_FROM_SPEND,
        investmentCategories: INVESTMENT_CATEGORIES,
      });
    }
    if (name === 'categories') return repos.categoryRepo.list();
    if (name === 'accounts') return repos.accountRepo.list();
    if (name === 'liabilities') return repos.liabilityRepo.list();
    if (name === 'holdings') {
      return getHoldings({ txRepo: repos.txRepo, holdingsRepo: repos.holdingsRepo, nav }, {});
    }
    if (name === 'networth') {
      return getNetWorth({
        assetRepo: repos.assetRepo,
        contributionRepo: repos.assetContributionRepo,
        rateRepo: repos.assetRateRepo,
        valuationRepo: repos.assetValuationRepo,
        liabilityRepo: repos.liabilityRepo,
        getMfHoldings: (filters: { account?: string }) =>
          getHoldings({ txRepo: repos.txRepo, holdingsRepo: repos.holdingsRepo, nav }, filters),
      });
    }
    if (name === 'universe_stats') {
      if (!repos.performanceUniverseRepo.getMeta()) throw new Error('the fund universe has not been built yet');
      const funds = repos.performanceUniverseRepo.listFunds({});
      const perf = new Map(repos.performanceUniverseRepo.getPerformance(funds.map((f) => f.amfiCode)).map((p) => [p.amfiCode, p]));
      return funds.map((f) => {
        const p = perf.get(f.amfiCode);
        return { ...f, ...(p ? performanceView(p) : {}) };
      });
    }
    if (name === 'category_stats') return repos.performanceUniverseRepo.listAllCategoryStats();
    if (name === 'fact_sheet') {
      const sheet = await buildCurrentFactSheet(repos, deps);
      if ('unavailable' in sheet) throw new Error(`fact sheet unavailable: ${sheet.unavailable}`);
      return sheet;
    }
    throw new Error(`Unknown dataset: ${name}`);
  };
}
