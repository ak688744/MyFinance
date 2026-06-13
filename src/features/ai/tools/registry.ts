import type { Tool } from './types';
import { getSpendingSummary, getCategoryTrend, getMonthlyComparison } from './spending';
import { searchTransactions, getRecentTransactions } from './transactions';
import { getHoldings, getPortfolioSummary, getFundTransactions } from './investments';

export const ALL_TOOLS: Tool[] = [
  getSpendingSummary,
  getCategoryTrend,
  getMonthlyComparison,
  searchTransactions,
  getRecentTransactions,
  getHoldings,
  getPortfolioSummary,
  getFundTransactions,
];

export function getToolByName(name: string): Tool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
