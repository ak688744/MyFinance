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

  // Investment tables
  await db.execAsync(`
    -- Master table for mutual fund metadata (enables flexible queries)
    CREATE TABLE IF NOT EXISTS investment_schemes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheme_name TEXT NOT NULL,
      amfi_code TEXT,
      isin TEXT,
      amc_name TEXT,
      category TEXT CHECK (category IN ('equity', 'debt', 'hybrid', 'other')),
      sub_category TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(scheme_name, amc_name)
    );

    -- Track all investment imports with date ranges
    CREATE TABLE IF NOT EXISTS investment_import_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_name TEXT NOT NULL,
      investment_app TEXT NOT NULL,
      import_type TEXT NOT NULL CHECK (import_type IN ('holdings', 'transactions')),
      file_name TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      record_count INTEGER,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      total_invested REAL,
      total_current_value REAL,
      total_xirr REAL,
      holder_name TEXT,
      holder_pan TEXT
    );

    -- Point-in-time holdings snapshots
    CREATE TABLE IF NOT EXISTS investment_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_history_id INTEGER NOT NULL,
      scheme_id INTEGER,
      account_name TEXT NOT NULL,
      investment_app TEXT NOT NULL,
      scheme_name TEXT NOT NULL,
      folio_number TEXT,
      units REAL NOT NULL,
      invested_value REAL NOT NULL,
      current_value REAL NOT NULL,
      returns_amount REAL NOT NULL,
      returns_xirr REAL,
      as_of_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (import_history_id) REFERENCES investment_import_history (id),
      FOREIGN KEY (scheme_id) REFERENCES investment_schemes (id)
    );

    -- Transaction history for period-wise returns
    CREATE TABLE IF NOT EXISTS investment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheme_id INTEGER,
      account_name TEXT NOT NULL,
      investment_app TEXT NOT NULL,
      scheme_name TEXT NOT NULL,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('PURCHASE', 'REDEMPTION', 'SWITCH_IN', 'SWITCH_OUT', 'DIVIDEND')),
      units REAL NOT NULL,
      nav REAL NOT NULL,
      amount REAL NOT NULL,
      transaction_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (scheme_id) REFERENCES investment_schemes (id)
    );

    -- Indexes for investment tables
    CREATE INDEX IF NOT EXISTS idx_investment_schemes_category
      ON investment_schemes (category, sub_category);
    CREATE INDEX IF NOT EXISTS idx_investment_schemes_amc
      ON investment_schemes (amc_name);
    CREATE INDEX IF NOT EXISTS idx_investment_holdings_scheme
      ON investment_holdings (scheme_id);
    CREATE INDEX IF NOT EXISTS idx_investment_holdings_date
      ON investment_holdings (as_of_date DESC);
    CREATE INDEX IF NOT EXISTS idx_investment_holdings_account
      ON investment_holdings (account_name, investment_app);
    CREATE INDEX IF NOT EXISTS idx_investment_transactions_scheme
      ON investment_transactions (scheme_id);
    CREATE INDEX IF NOT EXISTS idx_investment_transactions_account
      ON investment_transactions (account_name, investment_app);
    CREATE INDEX IF NOT EXISTS idx_investment_transactions_date
      ON investment_transactions (transaction_date DESC);
  `);
}
