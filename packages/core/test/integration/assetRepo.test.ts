import { describe, it, expect, beforeEach } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import { makeAssetRepo } from '../../src/repositories/assetRepo';

let repo: ReturnType<typeof makeAssetRepo>;
let sqlite: SqliteDatabase;

beforeEach(() => {
  const m = runMigrations(':memory:');
  sqlite = m.sqlite;
  repo = makeAssetRepo(m.db);
  sqlite.prepare(
    `INSERT INTO accounts (id, domain, institution, label) VALUES (1,'investment','SBI','PPF')`,
  ).run();
});

describe('assetRepo', () => {
  it('creates an asset with JSON params and reads it back parsed', () => {
    const id = repo.create({
      accountId: 1, assetClass: 'fd', name: 'SBI FD',
      valuationStrategy: 'computed',
      params: { compounding: 'quarterly', maturityDate: '2026-01-01' },
    });
    const a = repo.getById(id)!;
    expect(a.assetClass).toBe('fd');
    expect(a.params).toEqual({ compounding: 'quarterly', maturityDate: '2026-01-01' });
    expect(a.ingestionMode).toBe('manual_entry'); // default
    expect(a.status).toBe('active'); // default
  });

  it('stores null params as null', () => {
    const id = repo.create({ accountId: 1, assetClass: 'cash', name: 'Wallet', valuationStrategy: 'manual' });
    expect(repo.getById(id)!.params).toBeNull();
  });

  it('lists with account + class + status filters', () => {
    repo.create({ accountId: 1, assetClass: 'fd', name: 'FD1', valuationStrategy: 'computed' });
    repo.create({ accountId: 1, assetClass: 'ppf', name: 'PPF1', valuationStrategy: 'computed' });
    expect(repo.list({ assetClass: 'fd' }).length).toBe(1);
    expect(repo.list({ account: 1 }).length).toBe(2);
  });

  it('updates name/status/params and deletes', () => {
    const id = repo.create({ accountId: 1, assetClass: 'gold', name: 'Gold', valuationStrategy: 'manual' });
    repo.update(id, { name: 'Gold Bars', status: 'closed', params: { grams: 100 } });
    const a = repo.getById(id)!;
    expect(a.name).toBe('Gold Bars');
    expect(a.status).toBe('closed');
    expect(a.params).toEqual({ grams: 100 });
    repo.delete(id);
    expect(repo.getById(id)).toBeNull();
  });
});
