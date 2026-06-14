import { describe, it, expect, beforeEach } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';

let sqlite: SqliteDatabase;

beforeEach(() => {
  sqlite = runMigrations(':memory:').sqlite;
});

describe('L1.5 schema migration', () => {
  it('creates all six new tables', () => {
    const names = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r: any) => r.name);
    for (const t of [
      'accounts',
      'assets',
      'asset_contributions',
      'asset_rates',
      'asset_valuations',
      'liabilities',
    ]) {
      expect(names).toContain(t);
    }
  });

  it('adds account_id to transactions', () => {
    const cols = sqlite
      .prepare(`PRAGMA table_info(transactions)`)
      .all()
      .map((r: any) => r.name);
    expect(cols).toContain('account_id');
  });

  it('enforces the accounts domain CHECK', () => {
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO accounts (domain, institution, label) VALUES ('bogus','X','Y')`,
        )
        .run(),
    ).toThrow();
  });

  it('enforces the unique(domain, institution, label) on accounts', () => {
    const stmt = sqlite.prepare(
      `INSERT INTO accounts (domain, institution, label) VALUES ('investment','Groww','Personal')`,
    );
    stmt.run();
    expect(() => stmt.run()).toThrow();
  });

  it('enforces the liabilities tenure-or-emi CHECK', () => {
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO liabilities (name, loan_type, principal, annual_rate, start_date)
           VALUES ('L','home',1000,8,'2024-01-01')`,
        )
        .run(),
    ).toThrow();
  });

  it('allows two Groww accounts with distinct labels (multi-account)', () => {
    const stmt = sqlite.prepare(
      `INSERT INTO accounts (domain, institution, label) VALUES ('investment','Groww',?)`,
    );
    stmt.run('Personal');
    expect(() => stmt.run('Spouse')).not.toThrow();
  });
});
