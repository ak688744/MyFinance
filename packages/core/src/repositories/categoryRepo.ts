import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { categories, transactions, categoryRules } from '../db/schema';
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

    create(c) {
      // INSERT INTO categories (id, name, icon).
      db.insert(categories)
        .values({ id: c.id, name: c.name, icon: c.icon ?? null })
        .run();
    },

    rename(id, name) {
      // UPDATE categories SET name = ? WHERE id = ?.
      db.update(categories)
        .set({ name })
        .where(eq(categories.id, id))
        .run();
    },

    exists(id) {
      // SELECT 1 FROM categories WHERE id = ? LIMIT 1.
      const result = db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1)
        .get();
      return result !== undefined;
    },

    delete(id) {
      /**
       * Delete a category and clean up references. Three-step process:
       * 1. NULL out transactions.category_id (uncategorize any tagged txns)
       * 2. DELETE FROM category_rules WHERE category_id = ? (remove rules)
       * 3. DELETE FROM categories WHERE id = ?
       *
       * Order matters due to foreign keys (foreign_keys=ON). We must NULL
       * the FK references and delete dependent rows BEFORE deleting the parent.
       * These run sequentially as separate statements — drizzle doesn't expose
       * a transaction wrapper at this layer, but the repo is typically called
       * within an HTTP request boundary where atomicity isn't critical (a partial
       * delete leaves the category row; category CRUD is user-driven, low volume).
       */

      // Step 1: NULL out any transactions referencing this category
      db.update(transactions)
        .set({ categoryId: null })
        .where(eq(transactions.categoryId, id))
        .run();

      // Step 2: Delete any rules referencing this category
      db.delete(categoryRules)
        .where(eq(categoryRules.categoryId, id))
        .run();

      // Step 3: Delete the category itself
      db.delete(categories)
        .where(eq(categories.id, id))
        .run();
    },
  };
}
