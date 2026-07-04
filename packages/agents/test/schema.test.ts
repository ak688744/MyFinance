import { describe, it, expect } from 'vitest';
import { AiSuggestionBatchSchema } from '../src/categorize/schema';

describe('AiSuggestionBatchSchema', () => {
  it('accepts a valid batch', () => {
    const parsed = AiSuggestionBatchSchema.safeParse([
      { transactionId: 1, categoryId: 'food', keyword: 'swiggy', confidence: 0.9, reason: 'food delivery' },
    ]);
    expect(parsed.success).toBe(true);
  });
  it('rejects confidence out of range', () => {
    const parsed = AiSuggestionBatchSchema.safeParse([
      { transactionId: 1, categoryId: 'food', keyword: 'swiggy', confidence: 5 },
    ]);
    expect(parsed.success).toBe(false);
  });
  it('rejects a non-integer transactionId', () => {
    const parsed = AiSuggestionBatchSchema.safeParse([
      { transactionId: 1.5, categoryId: 'food', keyword: 'swiggy', confidence: 0.5 },
    ]);
    expect(parsed.success).toBe(false);
  });
});
