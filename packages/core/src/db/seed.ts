import type { Db } from './client';
import { makeCategoryRepo } from '../repositories/categoryRepo';
import { makeCategoryRuleRepo } from '../repositories/categoryRuleRepo';
import { makeExpenseTransactionRepo } from '../repositories/expenseTransactionRepo';
import { recategorizeNonManualTransactions } from '../domain/categorize';
import { starterCategories } from '../data/starterCategories';

/**
 * Port of the seed portion of the RN initializeDatabase: INSERT OR IGNORE each
 * starter category, then recategorize all non-manual transactions. Synchronous —
 * better-sqlite3 repos and the categorization engine are all synchronous.
 *
 * Idempotent: upsertStarter uses INSERT OR IGNORE so re-running never duplicates
 * or overwrites existing rows.
 */
export function seedDatabase(db: Db): void {
  const categoryRepo = makeCategoryRepo(db);
  const ruleRepo = makeCategoryRuleRepo(db);
  const expenseTxRepo = makeExpenseTransactionRepo(db);

  for (const category of starterCategories) {
    categoryRepo.upsertStarter({
      id: category.id,
      name: category.name,
      icon: category.icon,
    });
  }

  recategorizeNonManualTransactions({ ruleRepo, txRepo: expenseTxRepo });
}
