import { describe, it, expect, vi } from 'vitest';
import { runInvestmentReview, ReviewFailedError } from '../src/review/runInvestmentReview';
import { LlmError } from '../src/llm/types';

const sheet = { funds: [{ schemeId: 9, name: 'SBI Small Cap Fund', rolling3y: { beatPct: 4.2 }, replay: { diffInr: -11197 } }] };
const good = {
  summary: 'One fund lags persistently.',
  cards: [{ kind: 'dragging', title: 'SBI Small Cap Fund lags its index', detail: 'It beat the index in only 4.2% of windows.',
    fundIds: [9], impactInr: -11197, evidence: ['funds[0].rolling3y.beatPct'], discussPrompt: 'Should I worry about SBI Small Cap?' }],
};
const reply = (o: unknown) => ({ text: typeof o === 'string' ? o : JSON.stringify(o), usage: { inputTokens: 1, outputTokens: 1 } });

describe('runInvestmentReview', () => {
  it('returns a valid review after one call', async () => {
    const complete = vi.fn().mockResolvedValueOnce(reply(good));
    const out = await runInvestmentReview(sheet, { complete });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(out.review.cards).toHaveLength(1);
    expect(out.dropped).toEqual([]);
  });

  it('retries with feedback when a card invents a number, then drops it if still invalid', async () => {
    const bad = { ...good, cards: [...good.cards, { ...good.cards[0], title: 'Invented', detail: 'Up 19.9% this year.' }] };
    const complete = vi.fn().mockResolvedValue(reply(bad));
    const out = await runInvestmentReview(sheet, { complete });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][0].prompt).toMatch(/19\.9%/);
    expect(out.review.cards.map((c) => c.title)).toEqual(['SBI Small Cap Fund lags its index']);
    expect(out.dropped[0].title).toBe('Invented');
  });

  it('drops cards whose evidence path does not resolve', async () => {
    const noEvidence = { ...good, cards: [{ ...good.cards[0], evidence: ['funds[7].x'] }] };
    const complete = vi.fn().mockResolvedValue(reply(noEvidence));
    const out = await runInvestmentReview(sheet, { complete });
    expect(out.review.cards).toEqual([]);
  });

  it('throws ReviewFailedError after two unparseable replies', async () => {
    const complete = vi.fn().mockResolvedValue(reply('not json'));
    await expect(runInvestmentReview(sheet, { complete })).rejects.toBeInstanceOf(ReviewFailedError);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('rethrows auth errors immediately', async () => {
    const complete = vi.fn().mockRejectedValue(new LlmError('auth', 'bad key'));
    await expect(runInvestmentReview(sheet, { complete })).rejects.toBeInstanceOf(LlmError);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('keeps the first valid parse when the retry call fails', async () => {
    const bad = { ...good, cards: [{ ...good.cards[0], detail: 'Up 19.9%.' }, good.cards[0]] };
    const complete = vi.fn()
      .mockResolvedValueOnce(reply(bad))
      .mockRejectedValueOnce(new LlmError('network', 'timeout'));
    const out = await runInvestmentReview(sheet, { complete });
    expect(out.review.cards).toHaveLength(1);
  });
});
