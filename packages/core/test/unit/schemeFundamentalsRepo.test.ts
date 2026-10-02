import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeSchemeFundamentalsRepo } from '../../src/repositories/schemeFundamentalsRepo';

function seedScheme(sqlite: ReturnType<typeof runMigrations>['sqlite']): number {
  const r = sqlite.prepare("INSERT INTO investment_schemes (scheme_name, amfi_code) VALUES ('Fund A','100001')").run();
  return Number(r.lastInsertRowid);
}

describe('schemeFundamentalsRepo', () => {
  it('upserts latest and reads it back', () => {
    const { db, sqlite } = runMigrations(':memory:');
    const repo = makeSchemeFundamentalsRepo(db);
    const schemeId = seedScheme(sqlite);
    repo.upsert({ schemeId, expenseRatioDirect: 0.5, expenseRatioRegular: 1.5, planType: 'regular', aum: 12000, benchmarkName: 'Nifty 50', stdDev: null, sharpe: 1.1, beta: 0.9, alpha: 2.3, source: 'groww' });
    let got = repo.get(schemeId);
    expect(got?.expenseRatioRegular).toBe(1.5);
    repo.upsert({ schemeId, expenseRatioDirect: 0.4, expenseRatioRegular: 1.4, planType: 'direct', aum: 13000, benchmarkName: 'Nifty 50', stdDev: null, sharpe: null, beta: null, alpha: null, source: 'kuvera' });
    got = repo.get(schemeId);
    expect(got?.expenseRatioDirect).toBe(0.4);
    expect(got?.source).toBe('kuvera');
    expect(repo.get(999)).toBeNull();
    sqlite.close();
  });
});
