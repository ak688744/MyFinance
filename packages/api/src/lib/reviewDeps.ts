import { getNAVForDate, getLatestNAV, getNAVHistory, getSchemeInfo, type NavLookup } from '@myfinance/core';
import type { ReviewDeps } from './reviewService';

const nav: NavLookup = {
  getNAVForDate: (amfiCode, date) => getNAVForDate(amfiCode, date),
  getLatestNAV: (amfiCode) => getLatestNAV(amfiCode),
};

/** Real network-backed review deps; tests override pieces via Partial<ReviewDeps>. */
export function makeReviewDeps(overrides: Partial<ReviewDeps> = {}): ReviewDeps {
  return {
    nav,
    navHistory: (code, start, end) => getNAVHistory(code, start, end),
    schemeInfo: (code) => getSchemeInfo(code),
    today: () => new Date().toISOString().slice(0, 10),
    ...overrides,
  };
}
