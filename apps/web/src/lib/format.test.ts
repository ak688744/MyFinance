import { describe, it, expect } from 'vitest';
import { formatINR, formatCompactINR, formatPercent, formatDate } from './format';

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

describe('formatPercent', () => {
  it('formats with sign and one decimal', () => {
    expect(formatPercent(9.43)).toBe('+9.4%');
    expect(formatPercent(-6.2)).toBe('-6.2%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatPercent(null)).toBe('—');
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
