import type { SQLiteDatabase } from 'expo-sqlite';

import { recategorizeNonManualTransactions } from '../categorization/categorizeTransaction';

export type CategoryRecord = {
  id: string;
  name: string;
  icon: string | null;
};

export function slugifyCategoryName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function createCategory(
  db: SQLiteDatabase,
  input: { name: string; icon?: string | null }
) {
  const normalizedName = input.name.trim();
  const id = slugifyCategoryName(normalizedName);

  if (!id) {
    throw new Error('Category name must contain letters or numbers.');
  }

  await db.runAsync(
    `
      INSERT INTO categories (id, name, icon)
      VALUES (?, ?, ?)
    `,
    id,
    normalizedName,
    input.icon ?? null
  );
}

export async function renameCategory(
  db: SQLiteDatabase,
  input: { categoryId: string; name: string }
) {
  const normalizedName = input.name.trim();

  if (!normalizedName) {
    throw new Error('Category name cannot be empty.');
  }

  await db.runAsync(
    `
      UPDATE categories
      SET name = ?
      WHERE id = ?
    `,
    normalizedName,
    input.categoryId
  );
}

export async function deleteCategory(
  db: SQLiteDatabase,
  input: { categoryId: string }
) {
  await db.withExclusiveTransactionAsync(async () => {
    await db.runAsync(
      `
        UPDATE transactions
        SET category_id = NULL, category_source = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE category_id = ?
      `,
      input.categoryId
    );

    await db.runAsync(
      `
        DELETE FROM category_rules
        WHERE category_id = ?
      `,
      input.categoryId
    );

    await db.runAsync(
      `
        DELETE FROM categories
        WHERE id = ?
      `,
      input.categoryId
    );
  });

  await recategorizeNonManualTransactions(db);
}
