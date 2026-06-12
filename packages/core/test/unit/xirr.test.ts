import { describe, it, expect } from 'vitest';
import { calculateXIRR } from '../../src/domain/xirr';

describe('calculateXIRR', () => {
  it('returns null for fewer than 2 flows', () => {
    expect(calculateXIRR([{ date: '2024-01-01', amount: -100 }])).toBeNull();
  });
  it('returns null without both a positive and negative flow', () => {
    expect(calculateXIRR([
      { date: '2024-01-01', amount: -100 },
      { date: '2024-02-01', amount: -50 },
    ])).toBeNull();
  });
  it('~100% for a doubling over one year', () => {
    const r = calculateXIRR([
      { date: '2023-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 2000 },
    ]);
    expect(r).not.toBeNull();
    expect(r as number).toBeCloseTo(1.0, 2);
  });
  it('~0% when you get back exactly what you put in', () => {
    const r = calculateXIRR([
      { date: '2023-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 1000 },
    ]);
    expect(r as number).toBeCloseTo(0, 2);
  });
  it('handles a multi-flow SIP-like sequence (positive return)', () => {
    const r = calculateXIRR([
      { date: '2023-01-01', amount: -1000 },
      { date: '2023-06-01', amount: -1000 },
      { date: '2024-01-01', amount: 2200 },
    ]);
    expect(r).not.toBeNull();
    expect(r as number).toBeGreaterThan(0);
  });
});
