import type { InvestmentInsight } from '../../types';

export function buildInvestmentInsightSeed(insight: InvestmentInsight, fundNames: string[]): string {
  const funds = fundNames.length > 0 ? fundNames.join(', ') : `scheme IDs ${insight.schemeIds.join(', ')}`;
  return [
    `I'm reviewing a portfolio insight from my Investments page: "${insight.title}".`,
    `Detail: ${insight.detail}`,
    `Funds involved: ${funds}.`,
    `Explain what this means for my portfolio and what would help address it.`,
  ].join('\n');
}
