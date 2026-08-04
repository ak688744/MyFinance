import { describe, it, expect } from 'vitest';
import { categorizeWithAI } from '../src/categorize/aiCategorize';

const complete = async () => ({
  text: JSON.stringify([
    { transactionId: 1, categoryId: 'food', keyword: 'swiggy', confidence: 0.95 },
    { transactionId: 2, categoryId: 'food', keyword: 'zomato', confidence: 0.5 },  // below gate → dropped
  ]),
  usage: { inputTokens: 1, outputTokens: 1 },
});

describe('categorizeWithAI confidence gate', () => {
  it('drops suggestions below minConfidence (default 0.9) and counts them skipped', async () => {
    const txns = [
      { id: 1, description: 'SWIGGY ORDER', amount: 100, direction: 'debit' as const },
      { id: 2, description: 'ZOMATO ORDER', amount: 80, direction: 'debit' as const },
    ];
    const cats = [{ id: 'food', name: 'Food' }];
    const res = await categorizeWithAI(txns, { complete, categories: cats });
    expect(res.suggestions.map((s) => s.transactionId)).toEqual([1]);
    expect(res.skipped).toBe(1);
  });
});
