import type { Sqlite } from './db';

/**
 * Build a `runInTransaction` runner from a better-sqlite3 handle for the core
 * import orchestrators. better-sqlite3's `transaction(fn)` returns a callable
 * that executes `fn` atomically (committing on return, rolling back on throw);
 * we immediately invoke it so callers get `<T>(fn:()=>T)=>T`.
 */
export function makeRunInTransaction(sqlite: Sqlite): <T>(fn: () => T) => T {
  return <T>(fn: () => T): T => sqlite.transaction(fn)();
}
