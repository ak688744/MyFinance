import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeExpenseInsightTriageRepo } from '../../src/repositories/expenseInsightTriageRepo';

describe('expenseInsightTriageRepo', () => {
  it('upserts and reads back by signature', () => {
    const { db } = runMigrations(':memory:');
    const repo = makeExpenseInsightTriageRepo(db);
    repo.upsert({ signature: 'abc', month: '2026-06', verdictJson: '{"tier":"suppress"}', triagedAt: '2026-06-01T00:00:00Z' });
    const [row] = repo.getMany(['abc']);
    expect(row.signature).toBe('abc');
    expect(row.month).toBe('2026-06');
    expect(JSON.parse(row.verdictJson).tier).toBe('suppress');
  });

  it('upsert replaces an existing signature (insert-or-replace)', () => {
    const { db } = runMigrations(':memory:');
    const repo = makeExpenseInsightTriageRepo(db);
    repo.upsert({ signature: 'sig', month: '2026-06', verdictJson: '{"v":1}' });
    repo.upsert({ signature: 'sig', month: '2026-06', verdictJson: '{"v":2}' });
    const rows = repo.getMany(['sig']);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].verdictJson).v).toBe(2);
  });

  it('getMany returns only the signatures that exist (cache-hit subset)', () => {
    const { db } = runMigrations(':memory:');
    const repo = makeExpenseInsightTriageRepo(db);
    repo.upsert({ signature: 's1', month: '2026-06', verdictJson: '{}' });
    repo.upsert({ signature: 's2', month: '2026-06', verdictJson: '{}' });
    const rows = repo.getMany(['s1', 's3', 's2']);
    expect(rows.map((r) => r.signature).sort()).toEqual(['s1', 's2']);
  });

  it('getMany([]) → []', () => {
    const { db } = runMigrations(':memory:');
    expect(makeExpenseInsightTriageRepo(db).getMany([])).toEqual([]);
  });
});
