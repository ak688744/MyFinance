import { describe, it, expect } from 'vitest';
import { parseTickertapeFundData } from '../../src/domain/fundData/tickertape';
import fixture from '../fixtures/fundData/tickertape-fund-a.json';

describe('parseTickertapeFundData', () => {
  it('normalizes currentAllocation into holdings', () => {
    const r = parseTickertapeFundData(fixture, '100001');
    expect(r.source).toBe('tickertape');
    expect(r.holdings.length).toBeGreaterThan(0);
    expect(r.holdings[0].securityName.length).toBeGreaterThan(0);
  });
});
