import { describe, it, expect } from 'vitest';
import { parseCcStatement } from '../src/ccStatement/parseCcStatement';
import { LlmError } from '../src/llm/types';

const good = JSON.stringify({
  lineItems: [
    { date: '2026-06-02', merchant: 'SWIGGY', amount: 500 },
    { date: '2026-06-05', merchant: 'AMAZON REFUND', amount: -200 },
  ],
  detectedTotal: 300,
});

describe('parseCcStatement', () => {
  it('returns validated line items (signed) + detectedTotal', async () => {
    const complete = async () => ({ text: good, usage: { inputTokens: 1, outputTokens: 1 } });
    const out = await parseCcStatement(complete, 'STATEMENT TEXT');
    expect(out.lineItems).toHaveLength(2);
    expect(out.lineItems[1].amount).toBe(-200);
    expect(out.detectedTotal).toBe(300);
  });

  it('retries once on bad JSON then succeeds', async () => {
    let n = 0;
    const complete = async () => { n += 1; return { text: n === 1 ? 'not json' : good }; };
    const out = await parseCcStatement(complete, 'x');
    expect(n).toBe(2);
    expect(out.lineItems).toHaveLength(2);
  });

  it('throws cc_parse_failed after retry still bad', async () => {
    const complete = async () => ({ text: '{bad' });
    await expect(parseCcStatement(complete, 'x')).rejects.toThrow('cc_parse_failed');
  });

  it('rethrows auth LlmError without retrying', async () => {
    const complete = async () => { throw new LlmError('auth', 'bad key'); };
    await expect(parseCcStatement(complete, 'x')).rejects.toBeInstanceOf(LlmError);
  });

  it('accepts detectedTotal null', async () => {
    const complete = async () => ({ text: JSON.stringify({ lineItems: [{ date: '2026-06-02', merchant: 'X', amount: 10 }], detectedTotal: null }) });
    const out = await parseCcStatement(complete, 'x');
    expect(out.detectedTotal).toBeNull();
  });
});
