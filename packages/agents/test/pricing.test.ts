import { describe, it, expect } from 'vitest';
import { costUsd, pricingHint } from '../src/pricing';

describe('pricing', () => {
  it('computes cost from per-million rates', () => {
    // 1M input @ $0.30 + 0.5M output @ $2.50 = 0.30 + 1.25 = 1.55
    expect(costUsd(1_000_000, 500_000, 0.3, 2.5)).toBeCloseTo(1.55);
  });
  it('hint hit + miss', () => {
    expect(pricingHint('gemini-2.5-flash')).toEqual({ inputPerM: 0.3, outputPerM: 2.5 });
    expect(pricingHint('unknown-model-xyz')).toBeNull();
  });
});
