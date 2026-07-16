import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from './helpers';
import { runLoansOverview, runLoanAmortization } from '../src/tools/read/loans';
import type { McpContext } from '../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

function seedHomeLoan(ctx: McpContext): number {
  return ctx.repos.liabilityRepo.create({
    accountId: null, name: 'Home', loanType: 'home',
    principal: 1000000, annualRate: 9, tenureMonths: 120,
    emiAmount: null, startDate: '2024-01-01', status: 'active',
  });
}

describe('get_loans_overview', () => {
  it('returns [] on a fresh DB', async () => {
    ctx = seedContext();
    const p = (await runLoansOverview(ctx)).structuredContent as any;
    expect(p.loans).toEqual([]);
  });

  it('computes EMI + outstanding with INR labels for a tenure loan', async () => {
    ctx = seedContext();
    seedHomeLoan(ctx);
    const p = (await runLoansOverview(ctx)).structuredContent as any;
    expect(p.loans).toHaveLength(1);
    expect(p.loans[0].name).toBe('Home');
    expect(p.loans[0].principalInr).toBe(1000000);
    expect(p.loans[0].emiInr).toBeGreaterThan(0);
    expect(p.loans[0].outstandingInr).toBeGreaterThan(0);
    expect(p.loans[0].ratePercent).toBe(9);
  });
});

describe('get_loan_amortization', () => {
  it('returns isError for an unknown liability id', async () => {
    ctx = seedContext();
    const r = await runLoanAmortization(ctx, { liabilityId: 999 });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('999');
  });

  it('returns a schedule with INR-labelled rows', async () => {
    ctx = seedContext();
    const id = seedHomeLoan(ctx);
    const r = await runLoanAmortization(ctx, { liabilityId: id });
    expect(r.isError).toBeUndefined();
    const p = r.structuredContent as any;
    expect(p.liabilityId).toBe(id);
    expect(p.schedule.length).toBeGreaterThan(0);
    expect(p.schedule[0].emiInr).toBeGreaterThan(0);
    expect(p.schedule[0].balanceInr).toBeGreaterThan(0);
  });
});
