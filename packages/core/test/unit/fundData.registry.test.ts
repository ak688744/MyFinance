import { describe, it, expect } from 'vitest';
import { resolveFundDataAdapter } from '../../src/domain/fundData/registry';
import { fetchGrowwFundData } from '../../src/domain/fundData/groww';

describe('resolveFundDataAdapter', () => {
  it('maps groww to the groww adapter', () => {
    expect(resolveFundDataAdapter('groww')).toBe(fetchGrowwFundData);
  });
  it('throws statusCode-400 for an unsupported source', () => {
    expect(() => resolveFundDataAdapter('yahoo' as any)).toThrow(/unsupported/i);
  });
});
