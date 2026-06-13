import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeAccountRepo } from '../../src/repositories/accountRepo';

let repo: ReturnType<typeof makeAccountRepo>;
beforeEach(() => {
  repo = makeAccountRepo(runMigrations(':memory:').db);
});

describe('accountRepo', () => {
  it('creates and reads back an account', () => {
    const id = repo.create({ domain: 'investment', institution: 'Groww', label: 'Personal' });
    expect(id).toBeGreaterThan(0);
    const a = repo.getById(id);
    expect(a).toMatchObject({ domain: 'investment', institution: 'Groww', label: 'Personal' });
  });

  it('lists by domain', () => {
    repo.create({ domain: 'investment', institution: 'Groww', label: 'P' });
    repo.create({ domain: 'expense', institution: 'HDFC', label: 'Salary' });
    expect(repo.list({ domain: 'expense' }).map((a) => a.institution)).toEqual(['HDFC']);
    expect(repo.list().length).toBe(2);
  });

  it('ensureAccount is idempotent (find-or-create by triple)', () => {
    const a = repo.ensureAccount({ domain: 'investment', institution: 'Groww', label: 'Personal' });
    const b = repo.ensureAccount({ domain: 'investment', institution: 'Groww', label: 'Personal' });
    expect(a).toBe(b);
    expect(repo.list().length).toBe(1);
  });

  it('supports two Groww accounts with distinct labels', () => {
    repo.ensureAccount({ domain: 'investment', institution: 'Groww', label: 'Personal' });
    repo.ensureAccount({ domain: 'investment', institution: 'Groww', label: 'Spouse' });
    expect(repo.list({ domain: 'investment' }).length).toBe(2);
  });
});
