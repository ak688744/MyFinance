import { describe, it, expect, beforeEach } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import { makeHoldingsRepo } from '../../src/repositories/holdingsRepo';
import type { Db } from '../../src/db/client';

let repo: ReturnType<typeof makeHoldingsRepo>;
let sqlite: SqliteDatabase;
let db: Db;

beforeEach(() => {
  const m = runMigrations(':memory:');
  sqlite = m.sqlite;
  db = m.db;
  repo = makeHoldingsRepo(db);
  // FK parents: holdings.import_history_id -> investment_import_history.id,
  //             holdings.scheme_id -> investment_schemes.id
  sqlite
    .prepare(
      `INSERT INTO investment_schemes (id, scheme_name) VALUES (1,'X'),(2,'Y')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO investment_import_history
        (id, account_name, investment_app, import_type, start_date, end_date)
        VALUES (1,'A','groww','holdings','2024-01-01','2024-12-31')`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO investment_holdings
        (import_history_id, scheme_id, account_name, investment_app, scheme_name,
         units, invested_value, current_value, returns_amount, as_of_date)
        VALUES
         (1, 1, 'A', 'groww', 'X', 10, 1000, 1200, 200, '2024-12-31'),
         (1, 2, 'A', 'groww', 'Y', 20, 2000, 1800, -200, '2024-12-31'),
         (1, 1, 'B', 'groww', 'X', 5, 500, 700, 200, '2024-12-31')`,
    )
    .run();
});

describe('holdingsRepo.getHoldingsValue', () => {
  it('sums current/invested across all holdings', () => {
    const v = repo.getHoldingsValue({});
    expect(v.currentValue).toBe(1200 + 1800 + 700);
    expect(v.investedValue).toBe(1000 + 2000 + 500);
  });

  it('coalesces to 0 when no rows match', () => {
    const v = repo.getHoldingsValue({ account: 'NOPE' });
    expect(v).toEqual({ currentValue: 0, investedValue: 0 });
  });

  it('respects the account filter', () => {
    const v = repo.getHoldingsValue({ account: 'A' });
    expect(v.currentValue).toBe(1200 + 1800);
    expect(v.investedValue).toBe(1000 + 2000);
  });

  it('respects the schemeId filter', () => {
    const v = repo.getHoldingsValue({ schemeId: 1 });
    expect(v.currentValue).toBe(1200 + 700);
    expect(v.investedValue).toBe(1000 + 500);
  });

  it('respects both filters combined', () => {
    const v = repo.getHoldingsValue({ account: 'A', schemeId: 1 });
    expect(v.currentValue).toBe(1200);
    expect(v.investedValue).toBe(1000);
  });
});

describe('holdingsRepo.insert', () => {
  it('inserts a holding and returns a numeric id (round-trip)', () => {
    const id = repo.insert({
      importHistoryId: 1,
      schemeId: 2,
      accountName: 'C',
      investmentApp: 'groww',
      schemeName: 'Y',
      folioNumber: 'F123',
      units: 7,
      investedValue: 700,
      currentValue: 770,
      returnsAmount: 70,
      returnsXirr: 0.12,
      asOfDate: '2024-12-31',
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);

    const row = sqlite
      .prepare(
        `SELECT scheme_id, account_name, folio_number, units, invested_value,
                current_value, returns_amount, returns_xirr, as_of_date
         FROM investment_holdings WHERE id = ?`,
      )
      .get(id) as Record<string, unknown>;
    expect(row).toMatchObject({
      scheme_id: 2,
      account_name: 'C',
      folio_number: 'F123',
      units: 7,
      invested_value: 700,
      current_value: 770,
      returns_amount: 70,
      returns_xirr: 0.12,
      as_of_date: '2024-12-31',
    });
  });

  it('inserts with null schemeId/folioNumber/returnsXirr', () => {
    const id = repo.insert({
      importHistoryId: 1,
      schemeId: null,
      accountName: 'C',
      investmentApp: 'groww',
      schemeName: 'Unmatched',
      folioNumber: null,
      units: 1,
      investedValue: 100,
      currentValue: 110,
      returnsAmount: 10,
      returnsXirr: null,
      asOfDate: '2024-12-31',
    });
    const row = sqlite
      .prepare(
        `SELECT scheme_id, folio_number, returns_xirr FROM investment_holdings WHERE id = ?`,
      )
      .get(id) as Record<string, unknown>;
    expect(row.scheme_id).toBeNull();
    expect(row.folio_number).toBeNull();
    expect(row.returns_xirr).toBeNull();
  });
});
