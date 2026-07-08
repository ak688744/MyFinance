import { describe, it, expect } from 'vitest';
import { formatUsd, toDailyBars } from './aiUsageTransforms';

describe('aiUsageTransforms', () => {
  it('formats USD to cents', () => {
    expect(formatUsd(1.5)).toBe('$1.50');
    expect(formatUsd(0.0031)).toBe('$0.0031'); // sub-cent shows 4 dp
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.01)).toBe('$0.01');
    expect(formatUsd(0.009)).toBe('$0.0090');
  });

  it('maps byDay to chart bars', () => {
    const bars = toDailyBars({ byDay: [{ day: '2026-07-01', costUsd: 0.02 }] } as any);
    expect(bars).toEqual([{ label: '2026-07-01', value: 0.02 }]);
  });

  it('maps multiple days', () => {
    const bars = toDailyBars({
      byDay: [
        { day: '2026-07-01', costUsd: 0.02 },
        { day: '2026-07-02', costUsd: 0.15 },
      ],
    } as any);
    expect(bars).toEqual([
      { label: '2026-07-01', value: 0.02 },
      { label: '2026-07-02', value: 0.15 },
    ]);
  });
});
