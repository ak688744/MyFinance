import { describe, it, expect, vi } from 'vitest';
import { triageInsights, applyCadenceBackstop, type TriageEventInput, type TriagedInsight } from '../src/insights/triageInsights';
import { LlmError } from '../src/llm/types';

const event = (over: Partial<TriageEventInput> = {}): TriageEventInput => ({
  eventId: 'event:new_spend:ACME',
  signature: 'sig1',
  flaggedBy: [{ type: 'new_spend', title: 'New spending: Acme', detail: '' }],
  transactions: [{ id: 1, amount: 2400, category: 'shopping', tags: [], merchant: 'Acme', raw: 'UPI-ACME' }],
  ...over,
});

function fakeComplete(payload: unknown) {
  return vi.fn(async () => ({ text: JSON.stringify(payload), usage: { inputTokens: 10, outputTokens: 5 } }));
}

describe('triageInsights', () => {
  it('parses verdicts and carries eventId/signature through', async () => {
    const complete = fakeComplete({
      verdicts: [{
        eventId: 'event:new_spend:ACME', tier: 'needs_input', keep: true, lane: 'needs_input',
        refinedTitle: 'New: Acme', refinedDetail: '₹2400 at Acme', question: 'Recurring or one-off?',
        options: [
          { label: 'One-off', tags: ['one_off', 'gadget'], categoryFix: null },
          { label: 'Recurring', tags: ['recurring'], categoryFix: null },
        ],
        reason: 'cadence unknown',
      }],
    });
    const out = await triageInsights([event()], { complete });
    expect(out.verdicts).toHaveLength(1);
    const v = out.verdicts[0];
    expect(v.eventId).toBe('event:new_spend:ACME');
    expect(v.signature).toBe('sig1');
    expect(v.tier).toBe('needs_input');
    expect(v.options[0].tags).toEqual(['one_off', 'gadget']);
    expect(out.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('empty events → no LLM call, empty result', async () => {
    const complete = fakeComplete({ verdicts: [] });
    const out = await triageInsights([], { complete });
    expect(complete).not.toHaveBeenCalled();
    expect(out.verdicts).toEqual([]);
  });

  it('drops verdicts for unknown eventIds (hallucinated) and fills missing events as needs_clarity fallback', async () => {
    const complete = fakeComplete({
      verdicts: [
        { eventId: 'GHOST', tier: 'suppress', keep: false, lane: null, refinedTitle: 'x', refinedDetail: '', question: null, options: [], reason: '' },
      ],
    });
    const out = await triageInsights([event({ eventId: 'event:real', signature: 's' })], { complete });
    // ghost dropped; the real event, un-judged by the model, falls back to a kept needs_input card
    expect(out.verdicts.every((v) => v.eventId !== 'GHOST')).toBe(true);
    expect(out.verdicts).toHaveLength(1);
    expect(out.verdicts[0].eventId).toBe('event:real');
    expect(out.verdicts[0].keep).toBe(true);
  });

  it('retries once on invalid JSON, then falls back (no throw)', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ text: 'not json', usage: { inputTokens: 1, outputTokens: 1 } })
      .mockResolvedValueOnce({ text: 'still not json', usage: { inputTokens: 1, outputTokens: 1 } });
    const out = await triageInsights([event()], { complete });
    expect(complete).toHaveBeenCalledTimes(2);
    // fallback: keep the event as a needs_input card rather than losing it
    expect(out.verdicts).toHaveLength(1);
    expect(out.verdicts[0].keep).toBe(true);
  });

  it('rethrows auth / provider_not_configured (hard failures surface)', async () => {
    const complete = vi.fn(async () => { throw new LlmError('auth', 'bad key'); });
    await expect(triageInsights([event()], { complete })).rejects.toBeInstanceOf(LlmError);
  });

  it('coerces an out-of-vocab cadence tag: drops invalid tier verdicts to fallback', async () => {
    const complete = fakeComplete({
      verdicts: [{
        eventId: 'event:new_spend:ACME', tier: 'BOGUS_TIER', keep: true, lane: 'needs_input',
        refinedTitle: 't', refinedDetail: '', question: null, options: [], reason: '',
      }],
    });
    const out = await triageInsights([event()], { complete });
    // invalid schema → whole batch rejected → fallback keeps the event
    expect(out.verdicts).toHaveLength(1);
    expect(out.verdicts[0].keep).toBe(true);
  });

  it('DETERMINISTIC BACKSTOP: force-suppresses an event whose txn already carries a cadence tag, even if the model says needs_input', async () => {
    const cadenceTaggedEvent = event({
      transactions: [{ id: 237, amount: 60000, category: 'rent', tags: ['recurring', 'rent'], merchant: null, raw: 'UPI-...-LOAN' }],
    });
    const complete = fakeComplete({
      verdicts: [{
        // model wrongly re-asks about a description/category contradiction despite the cadence tag
        eventId: 'event:new_spend:ACME', tier: 'needs_input', keep: true, lane: 'needs_input',
        refinedTitle: '₹60,000 tagged rent — but description says LOAN', refinedDetail: '',
        question: 'Is this rent or a loan EMI?',
        options: [{ label: 'Loan EMI', tags: ['recurring', 'loan_emi'], categoryFix: 'loan' }],
        reason: 'contradiction',
      }],
    });
    const out = await triageInsights([cadenceTaggedEvent], { complete });
    expect(out.verdicts).toHaveLength(1);
    expect(out.verdicts[0].tier).toBe('suppress');
    expect(out.verdicts[0].keep).toBe(false);
    expect(out.verdicts[0].lane).toBeNull();
    expect(out.verdicts[0].question).toBeNull();
  });

  it('DETERMINISTIC BACKSTOP applies even on fallback (batch parse failure) for a cadence-tagged event', async () => {
    const cadenceTaggedEvent = event({ transactions: [{ id: 5, amount: 100, category: 'food', tags: ['one_off'], merchant: null, raw: 'x' }] });
    const complete = vi.fn(async () => ({ text: 'not json', usage: { inputTokens: 1, outputTokens: 1 } }));
    const out = await triageInsights([cadenceTaggedEvent], { complete });
    expect(out.verdicts).toHaveLength(1);
    expect(out.verdicts[0].tier).toBe('suppress');
    expect(out.verdicts[0].keep).toBe(false);
  });

  // Regression: a real transaction (categoryId='investment', tags=[recurring,sip]) was
  // permanently stuck showing "needs input" because a fallback verdict (LLM call failed
  // that round) got cached forever under its signature, with no way to re-check it later.
  // Fix: mark fallback verdicts as unconfident so callers (insightsService) can skip
  // persisting them — a transient failure means "try again next load", not "frozen wrong".
  it('marks a successfully-parsed model verdict as confident', async () => {
    const complete = fakeComplete({
      verdicts: [{
        eventId: 'event:new_spend:ACME', tier: 'needs_input', keep: true, lane: 'needs_input',
        refinedTitle: 't', refinedDetail: '', question: 'q?', options: [], reason: 'r',
      }],
    });
    const out = await triageInsights([event()], { complete });
    expect(out.verdicts[0].confident).toBe(true);
  });

  it('marks a fallback verdict (batch parse failure, no backstop) as NOT confident', async () => {
    const complete = vi.fn(async () => ({ text: 'not json', usage: { inputTokens: 1, outputTokens: 1 } }));
    const out = await triageInsights([event()], { complete });
    expect(out.verdicts[0].tier).toBe('needs_input');
    expect(out.verdicts[0].confident).toBe(false);
  });

  it('marks a backstop-forced suppression as confident, even when reached via fallback', async () => {
    const cadenceTaggedEvent = event({ transactions: [{ id: 5, amount: 100, category: 'food', tags: ['one_off'], merchant: null, raw: 'x' }] });
    const complete = vi.fn(async () => ({ text: 'not json', usage: { inputTokens: 1, outputTokens: 1 } }));
    const out = await triageInsights([cadenceTaggedEvent], { complete });
    expect(out.verdicts[0].tier).toBe('suppress');
    expect(out.verdicts[0].confident).toBe(true);
  });

  it('exports applyCadenceBackstop for callers to re-check a CACHED verdict without an LLM call', () => {
    const cadenceTaggedEvent = event({ transactions: [{ id: 327, amount: 15000, category: 'investment', tags: ['recurring', 'sip'], merchant: null, raw: 'x' }] });
    const staleCachedVerdict: TriagedInsight = {
      eventId: 'event:new_spend:ACME', signature: 'sig1', tier: 'needs_input', keep: true, lane: 'needs_input',
      refinedTitle: 'New spending', refinedDetail: 'x', question: 'Recurring or one-off?',
      options: [{ label: 'Recurring', tags: ['recurring'], categoryFix: null }],
      reason: 'Not confidently triaged by the model; surfaced for your review.', confident: false,
    };
    const healed = applyCadenceBackstop(staleCachedVerdict, cadenceTaggedEvent);
    expect(healed.tier).toBe('suppress');
    expect(healed.keep).toBe(false);

    // An event with no cadence tag passes through unchanged.
    const noTagEvent = event();
    const passthrough = applyCadenceBackstop(staleCachedVerdict, noTagEvent);
    expect(passthrough).toEqual(staleCachedVerdict);
  });
});
