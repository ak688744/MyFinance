import { describe, it, expect } from 'vitest';
import { categorizeWithAI, type CompleteFn } from '../src/categorize/aiCategorize';
import { LlmError } from '../src/llm/types';
import type { TxnForPrompt, CategoryForPrompt } from '../src/categorize/prompt';

const CATS: CategoryForPrompt[] = [{ id: 'food', name: 'Food' }, { id: 'transport', name: 'Transport' }];

function completeReturning(textPerCall: string[]): { complete: CompleteFn; calls: number } {
  let calls = 0;
  const complete: CompleteFn = async () => {
    const text = textPerCall[Math.min(calls, textPerCall.length - 1)];
    calls += 1;
    return { text, usage: { inputTokens: 10, outputTokens: 4 } };
  };
  return { complete, get calls() { return calls; } } as any;
}

describe('categorizeWithAI', () => {
  it('maps valid suggestions by transactionId and sums usage', async () => {
    const txns: TxnForPrompt[] = [{ id: 1, description: 'SWIGGY ORDER 123', amount: 250, direction: 'debit' }];
    const text = JSON.stringify([{ transactionId: 1, categoryId: 'food', keyword: 'swiggy', confidence: 0.9 }]);
    const { complete } = completeReturning([text]);
    const res = await categorizeWithAI(txns, { complete, categories: CATS });
    expect(res.suggestions).toEqual([{ transactionId: 1, categoryId: 'food', keyword: 'swiggy', confidence: 0.9 }]);
    expect(res.skipped).toBe(0);
    expect(res.usage.inputTokens).toBe(10);
  });

  it('chunks: 3 txns with chunkSize 2 → 2 complete calls and sums usage', async () => {
    const txns: TxnForPrompt[] = [1, 2, 3].map((id) => ({ id, description: `SWIGGY ${id}`, amount: 10, direction: 'debit' as const }));
    let calls = 0;
    const complete: CompleteFn = async ({ prompt }) => {
      calls += 1;
      const ids = [...prompt.matchAll(/"id": (\d+)/g)].map((m) => Number(m[1]));
      const arr = ids.map((id) => ({ transactionId: id, categoryId: 'food', keyword: 'swiggy', confidence: 0.8 }));
      return { text: JSON.stringify(arr), usage: { inputTokens: 15, outputTokens: 7 } };
    };
    const res = await categorizeWithAI(txns, { complete, categories: CATS, chunkSize: 2, minConfidence: 0 });
    expect(calls).toBe(2);
    expect(res.suggestions).toHaveLength(3);
    expect(res.usage.inputTokens).toBe(30); // 15 * 2
    expect(res.usage.outputTokens).toBe(14); // 7 * 2
  });

  it('drops a suggestion whose categoryId is not a real category', async () => {
    const txns: TxnForPrompt[] = [{ id: 1, description: 'X', amount: 1, direction: 'debit' }];
    const text = JSON.stringify([{ transactionId: 1, categoryId: 'made_up', keyword: 'x', confidence: 0.9 }]);
    const { complete } = completeReturning([text]);
    const res = await categorizeWithAI(txns, { complete, categories: CATS });
    expect(res.suggestions).toHaveLength(0);
  });

  it('keeps the suggestion but blanks keyword when keyword is not a substring of the description', async () => {
    const txns: TxnForPrompt[] = [{ id: 1, description: 'AMAZON PURCHASE', amount: 1, direction: 'debit' }];
    const text = JSON.stringify([{ transactionId: 1, categoryId: 'food', keyword: 'swiggy', confidence: 0.7 }]);
    const { complete } = completeReturning([text]);
    const res = await categorizeWithAI(txns, { complete, categories: CATS, minConfidence: 0 });
    expect(res.suggestions[0].categoryId).toBe('food');
    expect(res.suggestions[0].keyword).toBe('');
  });

  it('retries a chunk once on invalid JSON, then counts it skipped', async () => {
    const txns: TxnForPrompt[] = [{ id: 1, description: 'X', amount: 1, direction: 'debit' }];
    const { complete } = completeReturning(['not json', 'still not json']);
    const res = await categorizeWithAI(txns, { complete, categories: CATS });
    expect(res.suggestions).toHaveLength(0);
    expect(res.skipped).toBe(1);
  });

  it('retry-then-skip when complete throws a transient rate_limit twice', async () => {
    const txns: TxnForPrompt[] = [
      { id: 1, description: 'X', amount: 1, direction: 'debit' },
      { id: 2, description: 'Y', amount: 2, direction: 'debit' },
    ];
    let calls = 0;
    const complete: CompleteFn = async () => {
      calls += 1;
      throw new LlmError('rate_limit', 'slow down');
    };
    const res = await categorizeWithAI(txns, { complete, categories: CATS });
    expect(calls).toBe(2); // retried once
    expect(res.suggestions).toHaveLength(0);
    expect(res.skipped).toBe(txns.length);
  });

  it('rethrows when complete throws a hard auth error', async () => {
    const txns: TxnForPrompt[] = [{ id: 1, description: 'X', amount: 1, direction: 'debit' }];
    const complete: CompleteFn = async () => {
      throw new LlmError('auth', 'bad key');
    };
    await expect(categorizeWithAI(txns, { complete, categories: CATS })).rejects.toThrow(LlmError);
  });
});
