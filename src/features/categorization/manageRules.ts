import type { SQLiteDatabase } from 'expo-sqlite';

import type { CategoryRuleType } from './categorizeTransaction';
import { recategorizeNonManualTransactions } from './categorizeTransaction';

function normalizePatternValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function createRule(
  db: SQLiteDatabase,
  input: { ruleType: CategoryRuleType; patternValue: string; categoryId: string }
) {
  const normalizedPatternValue = normalizePatternValue(input.patternValue);

  if (!normalizedPatternValue) {
    throw new Error('Rule pattern cannot be empty.');
  }

  const priority = input.ruleType === 'merchant' ? 200 : 100;

  await db.runAsync(
    `
      INSERT INTO category_rules (
        rule_type,
        pattern_value,
        category_id,
        priority
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(rule_type, pattern_value)
      DO UPDATE SET
        category_id = excluded.category_id,
        priority = excluded.priority,
        is_active = 1
    `,
    input.ruleType,
    normalizedPatternValue,
    input.categoryId,
    priority
  );

  await recategorizeNonManualTransactions(db);
}

export async function updateRuleCategory(
  db: SQLiteDatabase,
  input: {
    ruleId: number;
    categoryId: string;
    ruleType: CategoryRuleType;
  }
) {
  const priority = input.ruleType === 'merchant' ? 200 : 100;

  await db.runAsync(
    `
      UPDATE category_rules
      SET category_id = ?, rule_type = ?, priority = ?
      WHERE id = ?
    `,
    input.categoryId,
    input.ruleType,
    priority,
    input.ruleId
  );

  await recategorizeNonManualTransactions(db);
}

export async function deleteRule(db: SQLiteDatabase, input: { ruleId: number }) {
  await db.runAsync(
    `
      DELETE FROM category_rules
      WHERE id = ?
    `,
    input.ruleId
  );

  await recategorizeNonManualTransactions(db);
}
