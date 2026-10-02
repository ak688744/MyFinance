import { describe, it, expect } from 'vitest';
import { InvestmentReviewSchema } from '../src/review/schema';
import { isAiTask, AI_TASKS } from '../src/tasks';

describe('investment review schema', () => {
  it('accepts a valid review and rejects an unknown card kind', () => {
    const card = { kind: 'dragging', title: 'SBI Small Cap lags persistently', detail: 'x', fundIds: [9], impactInr: null, evidence: ['funds[0].rolling3y.beatPct'], discussPrompt: 'Why?' };
    expect(InvestmentReviewSchema.safeParse({ summary: 's', cards: [card] }).success).toBe(true);
    expect(InvestmentReviewSchema.safeParse({ summary: 's', cards: [{ ...card, kind: 'sell' }] }).success).toBe(false);
  });
  it('registers the investment_review AI task', () => {
    expect(isAiTask('investment_review')).toBe(true);
    expect(AI_TASKS.investment_review.label).toBe('Investment Portfolio Review');
  });
});
