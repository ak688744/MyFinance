import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { makeRunInTransaction } from '../src/plugins/txRunner';

describe('makeRunInTransaction', () => {
  let db: Database.Database;
  afterEach(() => db?.close());

  it('commits work done inside the runner and returns its value', () => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    const run = makeRunInTransaction(db);

    const result = run(() => {
      db.prepare('INSERT INTO t (v) VALUES (?)').run('a');
      return 42;
    });

    expect(result).toBe(42);
    expect(db.prepare('SELECT COUNT(*) c FROM t').get()).toEqual({ c: 1 });
  });

  it('rolls back all work when the callback throws', () => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    const run = makeRunInTransaction(db);

    expect(() =>
      run(() => {
        db.prepare('INSERT INTO t (v) VALUES (?)').run('a');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.prepare('SELECT COUNT(*) c FROM t').get()).toEqual({ c: 0 });
  });
});
