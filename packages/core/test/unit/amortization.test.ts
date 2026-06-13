import { describe, it, expect } from 'vitest';
import {
  computeEmi,
  amortizationSchedule,
  loanStatus,
} from '../../src/domain/loans/amortization';
import type { Liability } from '../../src/types';

function loan(p: Partial<Liability> = {}): Liability {
  return {
    id: 1, accountId: null, name: 'Home', loanType: 'home',
    principal: 1000000, annualRate: 9, tenureMonths: 120,
    emiAmount: null, startDate: '2024-01-01', status: 'active', ...p,
  };
}

describe('computeEmi', () => {
  it('matches the standard EMI formula (10L @ 9% for 120 months ≈ 12667.58)', () => {
    const emi = computeEmi(1000000, 9, 120);
    expect(emi).toBeCloseTo(12667.58, 1);
  });
  it('handles zero interest as principal/tenure', () => {
    expect(computeEmi(120000, 0, 12)).toBeCloseTo(10000, 6);
  });
});

describe('amortizationSchedule', () => {
  it('produces tenure rows, splits principal+interest, ends at balance 0', () => {
    const rows = amortizationSchedule(loan());
    expect(rows.length).toBe(120);
    // first month interest = principal * monthlyRate
    expect(rows[0].interestComponent).toBeCloseTo(1000000 * (9 / 12 / 100), 2);
    expect(rows[0].principalComponent).toBeCloseTo(rows[0].emi - rows[0].interestComponent, 2);
    // each row: principal + interest == emi
    for (const r of rows) {
      expect(r.principalComponent + r.interestComponent).toBeCloseTo(r.emi, 2);
    }
    // final balance ~ 0
    expect(rows[rows.length - 1].balance).toBeCloseTo(0, 0);
    // due dates advance monthly from startDate (first due one month after start)
    expect(rows[0].dueDate).toBe('2024-02-01');
    expect(rows[1].dueDate).toBe('2024-03-01');
  });

  it('derives tenure when emiAmount is supplied instead of tenureMonths', () => {
    const rows = amortizationSchedule(loan({ tenureMonths: null, emiAmount: 12667.58 }));
    expect(rows.length).toBeGreaterThanOrEqual(119);
    expect(rows.length).toBeLessThanOrEqual(121);
  });
});

describe('loanStatus', () => {
  it('computes outstanding, paid, interest-remaining, progress at a point in time', () => {
    // 12 payments in (today = 2025-01-01, first due 2024-02-01 .. 2024-12-01 = 11 due)
    const s = loanStatus(loan(), new Date(2025, 0, 1));
    expect(s.outstanding).toBeGreaterThan(0);
    expect(s.outstanding).toBeLessThan(1000000);
    expect(s.paidPrincipal).toBeCloseTo(1000000 - s.outstanding, 2);
    expect(s.interestRemaining).toBeGreaterThan(0);
    expect(s.monthsRemaining).toBe(120 - 11);
    expect(s.nextDueDate).toBe('2025-01-01');
    expect(s.progressPercent).toBeCloseTo((s.paidPrincipal / 1000000) * 100, 2);
  });

  it('reports a fully-paid loan as outstanding 0, progress 100', () => {
    const s = loanStatus(loan(), new Date(2040, 0, 1));
    expect(s.outstanding).toBeCloseTo(0, 0);
    expect(s.monthsRemaining).toBe(0);
    expect(s.progressPercent).toBeCloseTo(100, 1);
  });
});
