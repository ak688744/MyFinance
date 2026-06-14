import { describe, it, expect, beforeEach } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import { makeAssetContributionRepo } from '../../src/repositories/assetContributionRepo';
import { makeAssetRateRepo } from '../../src/repositories/assetRateRepo';
import { makeAssetValuationRepo } from '../../src/repositories/assetValuationRepo';

let sqlite: SqliteDatabase;
let db: ReturnType<typeof runMigrations>['db'];

beforeEach(() => {
  const m = runMigrations(':memory:');
  sqlite = m.sqlite;
  db = m.db;
  sqlite.prepare(`INSERT INTO accounts (id, domain, institution, label) VALUES (1,'investment','SBI','PPF')`).run();
  sqlite.prepare(
    `INSERT INTO assets (id, account_id, asset_class, name, valuation_strategy) VALUES (1,1,'ppf','PPF','computed')`,
  ).run();
});

describe('assetContributionRepo', () => {
  it('inserts and lists by asset ordered by date asc', () => {
    const repo = makeAssetContributionRepo(db);
    repo.insert({ assetId: 1, contributionDate: '2024-02-01', amount: 500 });
    repo.insert({ assetId: 1, contributionDate: '2024-01-01', amount: 1000 });
    const rows = repo.listByAsset(1);
    expect(rows.map((r) => r.contributionDate)).toEqual(['2024-01-01', '2024-02-01']);
    expect(rows[0].amount).toBe(1000);
  });
});

describe('assetRateRepo', () => {
  it('inserts and lists by asset ordered by effective_from asc', () => {
    const repo = makeAssetRateRepo(db);
    repo.insert({ assetId: 1, effectiveFrom: '2024-07-01', rate: 7 });
    repo.insert({ assetId: 1, effectiveFrom: '2023-01-01', rate: 8 });
    const rows = repo.listByAsset(1);
    expect(rows.map((r) => r.effectiveFrom)).toEqual(['2023-01-01', '2024-07-01']);
  });
});

describe('assetValuationRepo', () => {
  it('inserts and lists by asset ordered by valued_at asc', () => {
    const repo = makeAssetValuationRepo(db);
    repo.insert({ assetId: 1, value: 350000, valuedAt: '2025-06-01' });
    repo.insert({ assetId: 1, value: 300000, valuedAt: '2025-01-01' });
    const rows = repo.listByAsset(1);
    expect(rows.map((r) => r.value)).toEqual([300000, 350000]);
  });
});
