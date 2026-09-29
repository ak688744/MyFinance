import { describe, it, expect } from 'vitest';
import { buildInvestmentInsightSeed } from '../src/features/investments/investmentInsightSeed';
import type { InvestmentInsight } from '../src/types';

const insight: InvestmentInsight = {
  id: 'overlap:1:2',
  kind: 'high_overlap',
  severity: 'warn',
  title: 'High overlap between Fund A and Fund B',
  detail: '62% portfolio overlap — both hold HDFC Bank and Reliance heavily.',
  schemeIds: [1, 2],
};

describe('buildInvestmentInsightSeed', () => {
  it('names the funds, includes the insight detail, and asks for explanation', () => {
    const seed = buildInvestmentInsightSeed(insight, ['Parag Parikh ELSS', 'Quant Midcap']);
    expect(seed).toContain('High overlap between Fund A and Fund B');
    expect(seed).toContain('62% portfolio overlap');
    expect(seed).toContain('Parag Parikh ELSS');
    expect(seed).toContain('Quant Midcap');
    expect(seed).toMatch(/explain what this means/i);
  });

  it('falls back to scheme IDs when fund names are empty', () => {
    const seed = buildInvestmentInsightSeed(insight, []);
    expect(seed).toContain('scheme IDs 1, 2');
  });
});
