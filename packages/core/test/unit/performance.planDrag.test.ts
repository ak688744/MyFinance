import { describe, it, expect } from 'vitest';
import { regularDirectDrag } from '../../src/domain/performance/planDrag';

describe('regularDirectDrag', () => {
  it('measures the yearly gap from NAV divergence', () => {
    const direct = [{ date: '2023-08-31', nav: 100 }, { date: '2026-08-31', nav: 100 }];
    const regular = [{ date: '2023-08-31', nav: 100 }, { date: '2026-08-31', nav: 100 * 0.99 ** 3 }];
    expect(regularDirectDrag(regular, direct, '2026-08-31', 3)).toBeCloseTo(1 / 0.99 - 1, 8);
  });
  it('is null without history at both ends', () => {
    expect(regularDirectDrag([], [{ date: '2026-08-31', nav: 1 }], '2026-08-31')).toBeNull();
  });
});
