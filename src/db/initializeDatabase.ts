import type { SQLiteDatabase } from 'expo-sqlite';

import { starterCategories } from '../data/starterCategories';
import { recategorizeNonManualTransactions } from '../features/categorization/categorizeTransaction';

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      transaction_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_date TEXT NOT NULL,
      value_date TEXT,
      reference_number TEXT,
      description TEXT NOT NULL,
      normalized_description TEXT NOT NULL,
      merchant_key TEXT,
      upi_note_keyword TEXT,
      amount REAL NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
      category_id TEXT,
      category_source TEXT,
      balance REAL,
      source_type TEXT NOT NULL,
      import_history_id INTEGER,
      dedupe_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories (id),
      FOREIGN KEY (import_history_id) REFERENCES import_history (id)
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date
      ON transactions (transaction_date DESC);

    CREATE INDEX IF NOT EXISTS idx_transactions_category
      ON transactions (category_id);

    CREATE TABLE IF NOT EXISTS category_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_type TEXT NOT NULL CHECK (rule_type IN ('merchant', 'upi_note_keyword')),
      pattern_value TEXT NOT NULL,
      category_id TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_from_transaction_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(rule_type, pattern_value),
      FOREIGN KEY (category_id) REFERENCES categories (id),
      FOREIGN KEY (created_from_transaction_id) REFERENCES transactions (id)
    );
  `);

  const transactionColumns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(transactions)'
  );
  const hasReferenceNumber = transactionColumns.some(
    (column) => column.name === 'reference_number'
  );
  const hasMerchantKey = transactionColumns.some(
    (column) => column.name === 'merchant_key'
  );
  const hasUpiNoteKeyword = transactionColumns.some(
    (column) => column.name === 'upi_note_keyword'
  );
  const hasCategorySource = transactionColumns.some(
    (column) => column.name === 'category_source'
  );

  if (!hasReferenceNumber) {
    await db.execAsync(
      'ALTER TABLE transactions ADD COLUMN reference_number TEXT'
    );
  }
  if (!hasMerchantKey) {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN merchant_key TEXT');
  }
  if (!hasUpiNoteKeyword) {
    await db.execAsync(
      'ALTER TABLE transactions ADD COLUMN upi_note_keyword TEXT'
    );
  }
  if (!hasCategorySource) {
    await db.execAsync(
      'ALTER TABLE transactions ADD COLUMN category_source TEXT'
    );
  }

  for (const category of starterCategories) {
    await db.runAsync(
      `
        INSERT OR IGNORE INTO categories (id, name, icon)
        VALUES (?, ?, ?)
      `,
      category.id,
      category.name,
      category.icon
    );
  }

  await recategorizeNonManualTransactions(db);
}
