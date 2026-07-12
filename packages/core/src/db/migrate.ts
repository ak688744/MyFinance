import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb, type Db } from './client';
import type { Database as SqliteDatabase } from 'better-sqlite3';

export function runMigrations(path?: string): {
  db: Db;
  sqlite: SqliteDatabase;
} {
  const { db, sqlite } = createDb(path);
  migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  });
  return { db, sqlite };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations(process.env.DB_PATH);
  console.log('migrations applied');
}
