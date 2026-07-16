import { describe, it, expect, afterEach } from 'vitest';
import { seedContext } from '../helpers';
import { runAddLiability, runUpdateLiability, runDeleteLiability } from '../../src/tools/write/liabilities';
import type { McpContext } from '../../src/context';

let ctx: McpContext;
afterEach(() => ctx?.close());

describe('add_liability', () => {
  it('creates a tenure-based loan', async () => {
    ctx = seedContext();
    const r = await runAddLiability(ctx, {
      name: 'Home Loan', loanType: 'home', principalInr: 1000000,
      annualRatePercent: 9, tenureMonths: 120, startDate: '2026-01-01',
    });
    expect(r.isError).toBeUndefined();
    const id = (r.structuredContent as { id: number }).id;
    expect(ctx.repos.liabilityRepo.getById(id)?.name).toBe('Home Loan');
  });

  it('rejects non-positive principal', async () => {
    ctx = seedContext();
    const r = await runAddLiability(ctx, {
      name: 'X', loanType: 'personal', principalInr: 0, annualRatePercent: 10,
      tenureMonths: 12, startDate: '2026-01-01',
    });
    expect(r.isError).toBe(true);
  });

  it('rejects both tenureMonths and emiAmountInr', async () => {
    ctx = seedContext();
    const r = await runAddLiability(ctx, {
      name: 'X', loanType: 'personal', principalInr: 100000, annualRatePercent: 10,
      tenureMonths: 120, emiAmountInr: 10000, startDate: '2026-01-01',
    });
    expect(r.isError).toBe(true);
  });

  it('rejects neither tenureMonths nor emiAmountInr', async () => {
    ctx = seedContext();
    const r = await runAddLiability(ctx, {
      name: 'X', loanType: 'personal', principalInr: 100000, annualRatePercent: 10,
      startDate: '2026-01-01',
    });
    expect(r.isError).toBe(true);
  });
});

describe('update_liability', () => {
  it('updates rate and can close via status', async () => {
    ctx = seedContext();
    const id = (await runAddLiability(ctx, {
      name: 'Car', loanType: 'car', principalInr: 500000, annualRatePercent: 8,
      tenureMonths: 60, startDate: '2026-01-01',
    })).structuredContent!.id as number;
    const r = await runUpdateLiability(ctx, { id, annualRatePercent: 7.5, status: 'closed' });
    expect(r.isError).toBeUndefined();
    const l = ctx.repos.liabilityRepo.getById(id)!;
    expect(l.annualRate).toBe(7.5);
    expect(l.status).toBe('closed');
  });

  it('unknown id returns isError', async () => {
    ctx = seedContext();
    const r = await runUpdateLiability(ctx, { id: 9999, annualRatePercent: 5 });
    expect(r.isError).toBe(true);
  });

  it('rejects non-positive principalInr update', async () => {
    ctx = seedContext();
    const id = (await runAddLiability(ctx, {
      name: 'Car', loanType: 'car', principalInr: 500000, annualRatePercent: 8,
      tenureMonths: 60, startDate: '2026-01-01',
    })).structuredContent!.id as number;
    const r = await runUpdateLiability(ctx, { id, principalInr: -1 });
    expect(r.isError).toBe(true);
    expect(ctx.repos.liabilityRepo.getById(id)?.principal).toBe(500000);
  });
});

describe('delete_liability (preview-gated)', () => {
  it('needs confirm', async () => {
    ctx = seedContext();
    const id = (await runAddLiability(ctx, {
      name: 'Personal', loanType: 'personal', principalInr: 100000, annualRatePercent: 12,
      tenureMonths: 24, startDate: '2026-01-01',
    })).structuredContent!.id as number;
    const p = await runDeleteLiability(ctx, { id });
    expect((p.structuredContent as { preview: boolean }).preview).toBe(true);
    expect(ctx.repos.liabilityRepo.getById(id)).toBeTruthy();
    const d = await runDeleteLiability(ctx, { id, confirm: true });
    expect(d.isError).toBeUndefined();
    expect(ctx.repos.liabilityRepo.getById(id)).toBeNull();
  });
});
