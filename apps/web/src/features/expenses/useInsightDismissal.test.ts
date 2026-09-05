import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInsightDismissal } from './useInsightDismissal';

describe('useInsightDismissal', () => {
  beforeEach(() => localStorage.clear());
  it('dismiss persists and isDismissed reflects it', () => {
    const { result } = renderHook(() => useInsightDismissal());
    expect(result.current.isDismissed('abnormal-spend:food:2026-08')).toBe(false);
    act(() => result.current.dismiss('abnormal-spend:food:2026-08'));
    expect(result.current.isDismissed('abnormal-spend:food:2026-08')).toBe(true);
    // survives a fresh hook instance (same localStorage)
    const { result: r2 } = renderHook(() => useInsightDismissal());
    expect(r2.current.isDismissed('abnormal-spend:food:2026-08')).toBe(true);
  });
});
