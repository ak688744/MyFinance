import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeSchemeHoldingsRepo } from '../../src/repositories/schemeHoldingsRepo';

function seedScheme(sqlite: ReturnType<typeof runMigrations>['sqlite'], name: string): number {
  return Number(sqlite.prepare(`INSERT INTO investment_schemes (scheme_name) VALUES ('${name}')`).run().lastInsertRowid);
}
const h = (name: string, w: number) => ({ securityName: name, isin: null, weightPct: w, sector: null, marketCapBucket: null });

describe('schemeHoldingsRepo', () => {
  it('replaceSnapshot is idempotent per as-of date', () => {
    const { db, sqlite } = runMigrations(':memory:');
    const repo = makeSchemeHoldingsRepo(db);
    const id = seedScheme(sqlite, 'A');
    repo.replaceSnapshot(id, '2026-08-31', [h('HDFC', 10), h('ICICI', 8)]);
    repo.replaceSnapshot(id, '2026-08-31', [h('HDFC', 12)]);
    expect(repo.getLatestSnapshot(id)).toHaveLength(1);
    expect(repo.getLatestSnapshot(id)[0].weightPct).toBe(12);
    sqlite.close();
  });
  it('getLatestSnapshot returns rows for the newest as-of date only', () => {
    const { db, sqlite } = runMigrations(':memory:');
    const repo = makeSchemeHoldingsRepo(db);
    const id = seedScheme(sqlite, 'A');
    repo.replaceSnapshot(id, '2026-07-31', [h('OLD', 5)]);
    repo.replaceSnapshot(id, '2026-08-31', [h('NEW', 5)]);
    expect(repo.getLatestSnapshot(id).map((r) => r.securityName)).toEqual(['NEW']);
    expect(repo.listAsOfDates(id)).toEqual(['2026-08-31', '2026-07-31']);
    sqlite.close();
  });
  it('prune keeps the newest N as-of dates', () => {
    const { db, sqlite } = runMigrations(':memory:');
    const repo = makeSchemeHoldingsRepo(db);
    const id = seedScheme(sqlite, 'A');
    for (const d of ['2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31']) repo.replaceSnapshot(id, d, [h('X', 1)]);
    const deleted = repo.prune(id, 2);
    expect(deleted).toBe(2);
    expect(repo.listAsOfDates(id)).toEqual(['2026-08-31', '2026-07-31']);
    sqlite.close();
  });
});
