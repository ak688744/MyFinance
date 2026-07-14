import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb, type Db } from './client';
import type { Database as SqliteDatabase } from 'better-sqlite3';

export function runMigrations(path?: string): {
  db: Db;
  sqlite: SqliteDatabase;
} {
  const { db, sqlite } = createDb(path);
  migrate(db, {
    migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
  });
  return { db, sqlite };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations(process.env.DB_PATH);
  console.log('migrations applied');
}
