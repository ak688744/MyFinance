import { desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { categoryRules } from '../db/schema';
import type { CategoryRuleRepo, StoredCategoryRule } from './types';

/**
 * Faithful port of the category-rule SQL in
 * src/features/categorization/categorizeTransaction.ts (getActiveCategoryRules)
 * and src/features/categorization/manageRules.ts (createRule/updateRuleCategory/
 * deleteRule).
 *
 * better-sqlite3 is synchronous, so every method is synchronous (no Promises).
 * Repos are PURE DATA ACCESS: the source RN functions also call
 * recategorizeNonManualTransactions after mutating, but that is DOMAIN
 * orchestration handled in a later task and is NOT replicated here. Pattern
 * normalization is also domain logic — repos receive already-final values.
 */

// Priority convention from the source: merchant -> 200, upi_note_keyword -> 100.
function defaultPriority(ruleType: StoredCategoryRule['ruleType']): number {
  return ruleType === 'merchant' ? 200 : 100;
}

export function makeCategoryRuleRepo(db: Db): CategoryRuleRepo {
  return {
    getActiveRules() {
      // SELECT id, rule_type, pattern_value, category_id, priority
      // FROM category_rules WHERE is_active = 1
      // ORDER BY priority DESC, id DESC
      return db
        .select({
          id: categoryRules.id,
          ruleType: categoryRules.ruleType,
          patternValue: categoryRules.patternValue,
          categoryId: categoryRules.categoryId,
          priority: categoryRules.priority,
        })
        .from(categoryRules)
        .where(eq(categoryRules.isActive, 1))
        .orderBy(desc(categoryRules.priority), desc(categoryRules.id))
        .all();
    },

    createRule(r) {
      const priority = r.priority ?? defaultPriority(r.ruleType);

      // INSERT ... ON CONFLICT(rule_type, pattern_value)
      // DO UPDATE SET category_id = excluded.category_id,
      //              priority = excluded.priority, is_active = 1
      const result = db
        .insert(categoryRules)
        .values({
          ruleType: r.ruleType,
          patternValue: r.patternValue,
          categoryId: r.categoryId,
          priority,
          createdFromTransactionId: r.createdFromTransactionId ?? null,
        })
        .onConflictDoUpdate({
          target: [categoryRules.ruleType, categoryRules.patternValue],
          set: {
            categoryId: r.categoryId,
            priority,
            isActive: 1,
          },
        })
        .returning({ id: categoryRules.id })
        .get();

      return result.id;
    },

    updateRuleCategory(ruleId, categoryId, ruleType, priority) {
      // Source manageRules.updateRuleCategory sets category_id AND rule_type AND
      // priority. ruleType/priority are optional here so callers that only need
      // a category change still work:
      //   UPDATE category_rules SET category_id = ?[, rule_type = ?, priority = ?]
      //   WHERE id = ?
      const set: { categoryId: string; ruleType?: typeof ruleType; priority?: number } = {
        categoryId,
      };
      if (ruleType !== undefined) set.ruleType = ruleType;
      if (priority !== undefined) set.priority = priority;

      db.update(categoryRules)
        .set(set)
        .where(eq(categoryRules.id, ruleId))
        .run();
    },

    deleteRule(ruleId) {
      // DELETE FROM category_rules WHERE id = ?
      db.delete(categoryRules).where(eq(categoryRules.id, ruleId)).run();
    },
  };
}
