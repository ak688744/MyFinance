import { describe, it, expect } from 'vitest';
import { checkText, collectFacts, extractNumbers, resolvePath } from '../src/review/numberGuard';

const sheet = {
  asOf: '2026-08-31',
  funds: [
    {
      name: 'Nippon India Small Cap Fund Direct Growth',
      benchmark: 'Nifty Smallcap 250 (Motilal Oswal index fund as proxy)',
      returnsPct: { r3y: 11.4 },
      rolling3y: { beatPct: 4.2 },
      lots: { longTermGainInr: 139000 },
      replay: { diffInr: -51318 },
    },
  ],
  portfolioInsights: [{ detail: 'Overlap 52.7% — about ₹79,748 duplicated' }],
};
const facts = collectFacts(sheet);

describe('extractNumbers', () => {
  it('parses rupee units and precision', () => {
    const [t] = extractNumbers('₹1.39L');
    expect(t.value).toBe(139000);
    expect(t.kind).toBe('inr');
    expect(t.tolerance).toBeCloseTo(500, 6);
    expect(extractNumbers('₹2.5 crore')[0].value).toBe(25_000_000);
    expect(extractNumbers('1,39,000')[0].value).toBe(139000);
    expect(extractNumbers('−5.4pp')[0]).toMatchObject({ value: 5.4, kind: 'pct' });
  });
});

describe('checkText', () => {
  it('accepts exact and rounded fact numbers', () => {
    expect(checkText('It returned 11.4% a year over three years.', facts).ok).toBe(true);
    expect(checkText('About 11% a year.', facts).ok).toBe(true);
    expect(checkText('Long-term gains of ₹1.39L (roughly ₹1.4 lakh).', facts).ok).toBe(true);
    expect(checkText('₹51,318 less than the index would have made.', facts).ok).toBe(true);
    expect(checkText('Beat the index in only 4.2% of windows.', facts).ok).toBe(true);
  });
  it('accepts numbers that appear inside fact strings', () => {
    expect(checkText('The pair overlaps 52.7%, about ₹79,748.', facts).ok).toBe(true);
  });
  it('rejects invented numbers', () => {
    const r = checkText('It returned 14.2% and could save ₹2.5 crore.', facts);
    expect(r.ok).toBe(false);
    expect(r.unsupported).toEqual(['14.2%', '₹2.5 crore']);
  });
  it('ignores numbers inside index and fund names, dates, small counts and periods', () => {
    expect(checkText('Nifty Smallcap 250, Nifty 50 and Nifty Midcap 150 all rose.', facts).ok).toBe(true);
    expect(checkText('Nippon India Small Cap Fund Direct Growth is fine.', facts).ok).toBe(true);
    expect(checkText('As of 2026-08-31, over 3-year and 5 year windows, 2 funds in 2026 over 36 months.', facts).ok).toBe(true);
  });
});

describe('checkText index names vs real percentages', () => {
  it('rejects an invented percentage that follows a cap word', () => {
    const r = checkText('Small cap 38% of equity is too high.', facts);
    expect(r.ok).toBe(false);
    expect(r.unsupported).toEqual(['38%']);
  });
  it('still exempts index names, including at the end of a sentence', () => {
    expect(checkText('It tracks the Smallcap 250 Index.', facts).ok).toBe(true);
    expect(checkText('Compared with Nifty 50.', facts).ok).toBe(true);
  });
});

describe('resolvePath', () => {
  it('walks dotted and indexed paths', () => {
    expect(resolvePath(sheet, 'funds[0].rolling3y.beatPct')).toBe(4.2);
    expect(resolvePath(sheet, 'funds[3].name')).toBeUndefined();
    expect(resolvePath(sheet, 'nope.x')).toBeUndefined();
  });
});
