import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeLiabilityRepo } from '../../src/repositories/liabilityRepo';

let repo: ReturnType<typeof makeLiabilityRepo>;
beforeEach(() => {
  repo = makeLiabilityRepo(runMigrations(':memory:').db);
});

describe('liabilityRepo', () => {
  it('creates a loan with tenure and reads it back', () => {
    const id = repo.create({
      name: 'Home', loanType: 'home', principal: 1000000,
      annualRate: 9, tenureMonths: 120, startDate: '2024-01-01',
    });
    const l = repo.getById(id)!;
    expect(l).toMatchObject({
      name: 'Home', loanType: 'home', principal: 1000000,
      annualRate: 9, tenureMonths: 120, emiAmount: null, status: 'active',
    });
  });

  it('creates a loan with emiAmount and null tenure', () => {
    const id = repo.create({
      name: 'Car', loanType: 'car', principal: 500000,
      annualRate: 10, emiAmount: 10000, startDate: '2024-01-01',
    });
    const l = repo.getById(id)!;
    expect(l.tenureMonths).toBeNull();
    expect(l.emiAmount).toBe(10000);
  });

  it('lists with status filter, updates, deletes', () => {
    const id = repo.create({ name: 'P', loanType: 'personal', principal: 100000, annualRate: 12, tenureMonths: 24, startDate: '2024-01-01' });
    expect(repo.list({ status: 'active' }).length).toBe(1);
    repo.update(id, { status: 'closed', annualRate: 11 });
    expect(repo.list({ status: 'active' }).length).toBe(0);
    expect(repo.getById(id)!.annualRate).toBe(11);
    repo.delete(id);
    expect(repo.getById(id)).toBeNull();
  });
});
