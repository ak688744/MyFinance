import { asc } from 'drizzle-orm';
import type { Db } from '../db/client';
import { categories } from '../db/schema';
import type { CategoryRepo } from './types';

/**
 * Faithful port of the categories-reading/writing SQL in
 * src/features/categories/manageCategories.ts and the starter-seed insert.
 *
 * better-sqlite3 is synchronous, so every method is synchronous (no Promises).
 * Repos own all Drizzle/SQL and return domain types. Recategorization
 * orchestration (recategorizeNonManualTransactions) is NOT done here — it is
 * domain logic handled in a later task.
 */
export function makeCategoryRepo(db: Db): CategoryRepo {
  return {
    list() {
      // ORDER BY name ASC.
      return db
        .select({ id: categories.id, name: categories.name, icon: categories.icon })
        .from(categories)
        .orderBy(asc(categories.name))
        .all();
    },

    upsertStarter(c) {
      // INSERT OR IGNORE INTO categories (id, name, icon) — idempotent seed.
      db.insert(categories)
        .values({ id: c.id, name: c.name, icon: c.icon })
        .onConflictDoNothing()
        .run();
    },
  };
}
