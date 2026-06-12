import { describe, it, expect, beforeEach } from 'vitest';
import type { Database as SqliteDatabase } from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate';
import { makeCategoryRepo } from '../../src/repositories/categoryRepo';
import type { Db } from '../../src/db/client';

let repo: ReturnType<typeof makeCategoryRepo>;
let sqlite: SqliteDatabase;
let db: Db;

beforeEach(() => {
  const m = runMigrations(':memory:');
  sqlite = m.sqlite;
  db = m.db;
  repo = makeCategoryRepo(db);
});

function countCategories(): number {
  const r = sqlite
    .prepare(`SELECT COUNT(*) as c FROM categories`)
    .get() as { c: number };
  return r.c;
}

describe('categoryRepo.upsertStarter', () => {
  it('inserts a category', () => {
    repo.upsertStarter({ id: 'food', name: 'Food', icon: 'utensils' });
    expect(repo.list()).toEqual([{ id: 'food', name: 'Food', icon: 'utensils' }]);
  });

  it('is idempotent — 2nd identical call does not error or duplicate', () => {
    repo.upsertStarter({ id: 'food', name: 'Food', icon: 'utensils' });
    repo.upsertStarter({ id: 'food', name: 'Food', icon: 'utensils' });
    expect(countCategories()).toBe(1);
  });

  it('INSERT OR IGNORE — 2nd call with same id keeps the original row', () => {
    repo.upsertStarter({ id: 'food', name: 'Food', icon: 'utensils' });
    repo.upsertStarter({ id: 'food', name: 'Changed', icon: 'changed' });
    expect(countCategories()).toBe(1);
    expect(repo.list()[0]).toEqual({ id: 'food', name: 'Food', icon: 'utensils' });
  });

  it('persists null icon', () => {
    repo.upsertStarter({ id: 'misc', name: 'Misc', icon: null });
    expect(repo.list()).toEqual([{ id: 'misc', name: 'Misc', icon: null }]);
  });
});

describe('categoryRepo.list', () => {
  it('returns categories ordered by name ASC', () => {
    repo.upsertStarter({ id: 'z', name: 'Zeta', icon: null });
    repo.upsertStarter({ id: 'a', name: 'Alpha', icon: null });
    repo.upsertStarter({ id: 'm', name: 'Mango', icon: null });
    expect(repo.list().map((c) => c.name)).toEqual(['Alpha', 'Mango', 'Zeta']);
  });

  it('returns empty array when no categories', () => {
    expect(repo.list()).toEqual([]);
  });
});
