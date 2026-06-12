import { describe, it, expect, beforeEach } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import { makeSchemeRepo } from '../../src/repositories/schemeRepo';
import type { Db } from '../../src/db/client';

let repo: ReturnType<typeof makeSchemeRepo>;
let sqlite: SqliteDatabase;
let db: Db;

beforeEach(() => {
  const m = runMigrations(':memory:');
  sqlite = m.sqlite;
  db = m.db;
  repo = makeSchemeRepo(db);
});

function countSchemes(): number {
  const r = sqlite
    .prepare(`SELECT COUNT(*) as c FROM investment_schemes`)
    .get() as { c: number };
  return r.c;
}

describe('schemeRepo.matchOrCreateScheme', () => {
  it('returns the SAME id on a 2nd identical call and creates no duplicate', () => {
    const id1 = repo.matchOrCreateScheme({
      schemeName: 'Parag Parikh Flexi Cap',
      amcName: 'PPFAS',
      category: 'equity',
      subCategory: 'flexi',
    });
    const id2 = repo.matchOrCreateScheme({
      schemeName: 'Parag Parikh Flexi Cap',
      amcName: 'PPFAS',
    });
    expect(id2).toBe(id1);
    expect(countSchemes()).toBe(1);
  });

  it('matches an existing null-AMC row when called without amcName', () => {
    const id1 = repo.matchOrCreateScheme({ schemeName: 'No AMC Fund' });
    const id2 = repo.matchOrCreateScheme({ schemeName: 'No AMC Fund' });
    expect(id2).toBe(id1);
    expect(countSchemes()).toBe(1);
  });

  it('does NOT match a row that has an AMC when called without amcName', () => {
    const withAmc = repo.matchOrCreateScheme({
      schemeName: 'Same Name Fund',
      amcName: 'AMC1',
    });
    const withoutAmc = repo.matchOrCreateScheme({ schemeName: 'Same Name Fund' });
    expect(withoutAmc).not.toBe(withAmc);
    expect(countSchemes()).toBe(2);
  });

  it('persists null category/subCategory/amc when omitted', () => {
    const id = repo.matchOrCreateScheme({ schemeName: 'Bare Fund' });
    const s = repo.getSchemeById(id);
    expect(s).toEqual({
      id,
      schemeName: 'Bare Fund',
      amfiCode: null,
      isin: null,
      amcName: null,
      category: null,
      subCategory: null,
    });
  });
});

describe('schemeRepo.getSchemeById', () => {
  it('maps row to camelCase Scheme preserving nulls', () => {
    const id = repo.matchOrCreateScheme({
      schemeName: 'Mapped Fund',
      amcName: 'AMCX',
      category: 'debt',
      subCategory: 'gilt',
    });
    const s = repo.getSchemeById(id);
    expect(s).toEqual({
      id,
      schemeName: 'Mapped Fund',
      amfiCode: null,
      isin: null,
      amcName: 'AMCX',
      category: 'debt',
      subCategory: 'gilt',
    });
  });

  it('returns null for a missing id', () => {
    expect(repo.getSchemeById(9999)).toBeNull();
  });
});

describe('schemeRepo.getSchemes', () => {
  beforeEach(() => {
    repo.matchOrCreateScheme({ schemeName: 'Zeta Equity', amcName: 'Z', category: 'equity' });
    repo.matchOrCreateScheme({ schemeName: 'Alpha Debt', amcName: 'A', category: 'debt' });
    repo.matchOrCreateScheme({ schemeName: 'Beta Equity', amcName: 'A', category: 'equity' });
  });

  it('returns all schemes ordered by scheme_name ASC', () => {
    const names = repo.getSchemes().map((s) => s.schemeName);
    expect(names).toEqual(['Alpha Debt', 'Beta Equity', 'Zeta Equity']);
  });

  it('filters by category', () => {
    const names = repo.getSchemes({ category: 'equity' }).map((s) => s.schemeName);
    expect(names).toEqual(['Beta Equity', 'Zeta Equity']);
  });

  it('filters by amc', () => {
    const names = repo.getSchemes({ amc: 'A' }).map((s) => s.schemeName);
    expect(names).toEqual(['Alpha Debt', 'Beta Equity']);
  });

  it('filters by search (LIKE %term%)', () => {
    const names = repo.getSchemes({ search: 'Equity' }).map((s) => s.schemeName);
    expect(names).toEqual(['Beta Equity', 'Zeta Equity']);
  });

  it('combines filters', () => {
    const names = repo
      .getSchemes({ category: 'equity', amc: 'A' })
      .map((s) => s.schemeName);
    expect(names).toEqual(['Beta Equity']);
  });
});

describe('schemeRepo.findSchemeByName', () => {
  it('matches on scheme_name ignoring AMC', () => {
    const id = repo.matchOrCreateScheme({ schemeName: 'Find Me', amcName: 'AMCQ' });
    const s = repo.findSchemeByName('Find Me');
    expect(s?.id).toBe(id);
    expect(s?.amcName).toBe('AMCQ');
  });

  it('returns null when not found', () => {
    expect(repo.findSchemeByName('Nope')).toBeNull();
  });
});

describe('schemeRepo.updateAmfiCode', () => {
  it('persists the amfi code', () => {
    const id = repo.matchOrCreateScheme({ schemeName: 'Amfi Fund' });
    repo.updateAmfiCode(id, '147482');
    expect(repo.getSchemeById(id)?.amfiCode).toBe('147482');
  });
});

describe('schemeRepo.getUnmatchedSchemes', () => {
  it('returns only NULL-amfi schemes, ordered by scheme_name ASC', () => {
    const zeta = repo.matchOrCreateScheme({ schemeName: 'Zeta Fund' });
    repo.matchOrCreateScheme({ schemeName: 'Alpha Fund' });
    const coded = repo.matchOrCreateScheme({ schemeName: 'Coded Fund' });
    repo.updateAmfiCode(coded, '147482');
    void zeta;

    const names = repo.getUnmatchedSchemes().map((s) => s.schemeName);
    expect(names).toEqual(['Alpha Fund', 'Zeta Fund']);
  });

  it('returns [] when every scheme has an amfi code', () => {
    const id = repo.matchOrCreateScheme({ schemeName: 'Solo' });
    repo.updateAmfiCode(id, '100000');
    expect(repo.getUnmatchedSchemes()).toEqual([]);
  });
});

describe('schemeRepo.getSchemesWithAmfi', () => {
  beforeEach(() => {
    // scheme 1 has amfi, scheme 2 null amfi
    const coded = repo.matchOrCreateScheme({ schemeName: 'Coded', amcName: 'C' });
    const uncoded = repo.matchOrCreateScheme({ schemeName: 'Uncoded', amcName: 'U' });
    repo.updateAmfiCode(coded, 'AMFI1');
    // seed import history (FK parent) + holdings referencing both schemes
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
           (1, ${coded}, 'A', 'groww', 'Coded', 10, 1000, 1200, 200, '2024-12-31'),
           (1, ${coded}, 'A', 'groww', 'Coded', 5, 500, 600, 100, '2024-12-31'),
           (1, ${uncoded}, 'B', 'groww', 'Uncoded', 3, 300, 330, 30, '2024-12-31')`,
      )
      .run();
  });

  it('returns only amfi-coded schemes, DISTINCT', () => {
    const rows = repo.getSchemesWithAmfi({});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ schemeId: expect.any(Number), amfiCode: 'AMFI1' });
  });

  it('respects the account filter (on holdings.account_name)', () => {
    expect(repo.getSchemesWithAmfi({ account: 'A' })).toHaveLength(1);
    expect(repo.getSchemesWithAmfi({ account: 'B' })).toHaveLength(0);
  });
});
