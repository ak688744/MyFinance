import { describe, it, expect } from 'vitest';
import {
  formatINR, formatCompactINR, formatCompactShort, formatPercent, formatDate,
  currentMonth, addMonths, monthBounds, formatMonthLong, monthWindow,
} from './format';

describe('formatINR', () => {
  it('groups in the Indian system', () => {
    expect(formatINR(1177540)).toBe('₹11,77,540');
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(-450)).toBe('-₹450');
  });
  it('rounds to whole rupees', () => {
    expect(formatINR(99.6)).toBe('₹100');
  });
  it('handles null/undefined', () => {
    expect(formatINR(null)).toBe('—');
    expect(formatINR(undefined)).toBe('—');
  });
});

describe('formatCompactINR', () => {
  it('uses lakh/crore', () => {
    expect(formatCompactINR(18400000)).toBe('₹1.84Cr');
    expect(formatCompactINR(1177540)).toBe('₹11.8L');
    expect(formatCompactINR(45000)).toBe('₹45,000');
  });
});

describe('formatCompactShort', () => {
  it('uses K/L/Cr tiers and drops trailing .0', () => {
    expect(formatCompactShort(42000)).toBe('₹42K');
    expect(formatCompactShort(4200)).toBe('₹4.2K');
    expect(formatCompactShort(420000)).toBe('₹4.2L');
    expect(formatCompactShort(500000)).toBe('₹5L');
    expect(formatCompactShort(18400000)).toBe('₹1.8Cr');
    expect(formatCompactShort(999)).toBe('₹999');
    expect(formatCompactShort(0)).toBe('₹0');
    expect(formatCompactShort(null)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('formats with sign and one decimal', () => {
    expect(formatPercent(9.43)).toBe('+9.4%');
    expect(formatPercent(-6.2)).toBe('-6.2%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('month helpers', () => {
  it('currentMonth pads the month', () => {
    expect(currentMonth(new Date(2026, 6, 3))).toBe('2026-07'); // month is 0-indexed
    expect(currentMonth(new Date(2026, 0, 1))).toBe('2026-01');
  });
  it('addMonths shifts across year boundaries', () => {
    expect(addMonths('2026-07', 1)).toBe('2026-08');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-03', -5)).toBe('2025-10');
  });
  it('monthBounds returns inclusive from/to', () => {
    expect(monthBounds('2026-07')).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });
  it('formatMonthLong', () => {
    expect(formatMonthLong('2026-07')).toBe('July 2026');
    expect(formatMonthLong('bad')).toBe('bad');
  });
});

describe('monthWindow', () => {
  const many = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  it('centres 3-before / 3-after on the selection when room exists', () => {
    expect(monthWindow(many, '2026-05')).toEqual(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
  });
  it('shifts forward when the selection is near the start', () => {
    expect(monthWindow(many, '2026-01')).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
  });
  it('shifts backward when the selection is near the end', () => {
    expect(monthWindow(many, '2026-09')).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  });
  it('returns all months when fewer than the window size exist', () => {
    expect(monthWindow(['2026-05', '2026-06'], '2026-06')).toEqual(['2026-05', '2026-06']);
  });
  it('includes the selected month even if it has no data', () => {
    expect(monthWindow(['2026-01', '2026-02'], '2026-07')).toEqual(['2026-01', '2026-02', '2026-07']);
  });
});

describe('formatDate', () => {
  it('formats ISO to dd MMM yyyy', () => {
    expect(formatDate('2025-01-15')).toBe('15 Jan 2025');
  });
  it('falls back to the raw string on malformed input', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});
