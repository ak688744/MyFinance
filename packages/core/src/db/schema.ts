import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

/**
 * Faithful port of the existing SQLite schema defined in
 * src/db/initializeDatabase.ts. Money/units/nav columns are REAL (float),
 * a deliberate decision (NOT integer paise). Timestamps are TEXT ISO with
 * CURRENT_TIMESTAMP defaults. All NOT NULL, DEFAULT, CHECK, UNIQUE, FOREIGN
 * KEY and named INDEX constraints are reproduced exactly.
 */

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  icon: text('icon'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    domain: text('domain', { enum: ['investment', 'expense'] }).notNull(),
    assetClass: text('asset_class'),
    institution: text('institution').notNull(),
    label: text('label').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    uniqueAccount: unique().on(table.domain, table.institution, table.label),
    domainCheck: check(
      'accounts_domain_check',
      sql`${table.domain} IN ('investment', 'expense')`,
    ),
  }),
);

export const importHistory = sqliteTable('import_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceName: text('source_name').notNull(),
  sourceType: text('source_type').notNull(),
  importedAt: text('imported_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  transactionCount: integer('transaction_count').notNull().default(0),
});

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    transactionDate: text('transaction_date').notNull(),
    valueDate: text('value_date'),
    referenceNumber: text('reference_number'),
    description: text('description').notNull(),
    normalizedDescription: text('normalized_description').notNull(),
    merchantKey: text('merchant_key'),
    upiNoteKeyword: text('upi_note_keyword'),
    amount: real('amount').notNull(),
    direction: text('direction', { enum: ['debit', 'credit'] }).notNull(),
    categoryId: text('category_id').references(() => categories.id),
    categorySource: text('category_source'),
    balance: real('balance'),
    sourceType: text('source_type').notNull(),
    importHistoryId: integer('import_history_id').references(
      () => importHistory.id,
    ),
    accountId: integer('account_id').references(() => accounts.id),
    dedupeKey: text('dedupe_key').notNull().unique(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idxTransactionsDate: index('idx_transactions_date').on(
      sql`${table.transactionDate} DESC`,
    ),
    idxTransactionsCategory: index('idx_transactions_category').on(
      table.categoryId,
    ),
    directionCheck: check(
      'transactions_direction_check',
      sql`${table.direction} IN ('debit', 'credit')`,
    ),
  }),
);

export const categoryRules = sqliteTable(
  'category_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ruleType: text('rule_type', {
      enum: ['merchant', 'upi_note_keyword'],
    }).notNull(),
    patternValue: text('pattern_value').notNull(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    priority: integer('priority').notNull().default(0),
    isActive: integer('is_active').notNull().default(1),
    createdFromTransactionId: integer('created_from_transaction_id').references(
      () => transactions.id,
    ),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    uniqueRuleTypePattern: unique().on(table.ruleType, table.patternValue),
    ruleTypeCheck: check(
      'category_rules_rule_type_check',
      sql`${table.ruleType} IN ('merchant', 'upi_note_keyword')`,
    ),
  }),
);

export const investmentSchemes = sqliteTable(
  'investment_schemes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    schemeName: text('scheme_name').notNull(),
    amfiCode: text('amfi_code'),
    isin: text('isin'),
    amcName: text('amc_name'),
    category: text('category', {
      enum: ['equity', 'debt', 'hybrid', 'other'],
    }),
    subCategory: text('sub_category'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    uniqueSchemeNameAmc: unique().on(table.schemeName, table.amcName),
    idxInvestmentSchemesCategory: index('idx_investment_schemes_category').on(
      table.category,
      table.subCategory,
    ),
    idxInvestmentSchemesAmc: index('idx_investment_schemes_amc').on(
      table.amcName,
    ),
    categoryCheck: check(
      'investment_schemes_category_check',
      sql`${table.category} IN ('equity', 'debt', 'hybrid', 'other')`,
    ),
  }),
);

export const investmentImportHistory = sqliteTable(
  'investment_import_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountName: text('account_name').notNull(),
    investmentApp: text('investment_app').notNull(),
    importType: text('import_type', {
      enum: ['holdings', 'transactions'],
    }).notNull(),
    fileName: text('file_name'),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    recordCount: integer('record_count'),
    importedAt: text('imported_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    totalInvested: real('total_invested'),
    totalCurrentValue: real('total_current_value'),
    totalXirr: real('total_xirr'),
    holderName: text('holder_name'),
    holderPan: text('holder_pan'),
  },
  (table) => ({
    importTypeCheck: check(
      'investment_import_history_import_type_check',
      sql`${table.importType} IN ('holdings', 'transactions')`,
    ),
  }),
);

export const investmentHoldings = sqliteTable(
  'investment_holdings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    importHistoryId: integer('import_history_id')
      .notNull()
      .references(() => investmentImportHistory.id),
    schemeId: integer('scheme_id').references(() => investmentSchemes.id),
    accountName: text('account_name').notNull(),
    investmentApp: text('investment_app').notNull(),
    schemeName: text('scheme_name').notNull(),
    folioNumber: text('folio_number'),
    units: real('units').notNull(),
    investedValue: real('invested_value').notNull(),
    currentValue: real('current_value').notNull(),
    returnsAmount: real('returns_amount').notNull(),
    returnsXirr: real('returns_xirr'),
    asOfDate: text('as_of_date').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idxInvestmentHoldingsScheme: index('idx_investment_holdings_scheme').on(
      table.schemeId,
    ),
    idxInvestmentHoldingsDate: index('idx_investment_holdings_date').on(
      sql`${table.asOfDate} DESC`,
    ),
    idxInvestmentHoldingsAccount: index('idx_investment_holdings_account').on(
      table.accountName,
      table.investmentApp,
    ),
  }),
);

export const investmentTransactions = sqliteTable(
  'investment_transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    schemeId: integer('scheme_id').references(() => investmentSchemes.id),
    accountName: text('account_name').notNull(),
    investmentApp: text('investment_app').notNull(),
    schemeName: text('scheme_name').notNull(),
    transactionType: text('transaction_type', {
      enum: [
        'PURCHASE',
        'REDEMPTION',
        'SWITCH_IN',
        'SWITCH_OUT',
        'DIVIDEND',
      ],
    }).notNull(),
    units: real('units').notNull(),
    nav: real('nav').notNull(),
    amount: real('amount').notNull(),
    transactionDate: text('transaction_date').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idxInvestmentTransactionsScheme: index(
      'idx_investment_transactions_scheme',
    ).on(table.schemeId),
    idxInvestmentTransactionsAccount: index(
      'idx_investment_transactions_account',
    ).on(table.accountName, table.investmentApp),
    idxInvestmentTransactionsDate: index(
      'idx_investment_transactions_date',
    ).on(sql`${table.transactionDate} DESC`),
    transactionTypeCheck: check(
      'investment_transactions_transaction_type_check',
      sql`${table.transactionType} IN ('PURCHASE', 'REDEMPTION', 'SWITCH_IN', 'SWITCH_OUT', 'DIVIDEND')`,
    ),
  }),
);

export const assets = sqliteTable(
  'assets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    assetClass: text('asset_class', {
      enum: ['ppf', 'epf', 'nps', 'fd', 'gold', 'real_estate', 'cash'],
    }).notNull(),
    name: text('name').notNull(),
    valuationStrategy: text('valuation_strategy', {
      enum: ['computed', 'manual'],
    }).notNull(),
    ingestionMode: text('ingestion_mode', {
      enum: ['manual_entry', 'file_import'],
    })
      .notNull()
      .default('manual_entry'),
    params: text('params'),
    status: text('status', { enum: ['active', 'closed'] })
      .notNull()
      .default('active'),
    openedAt: text('opened_at'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idxAssetsAccount: index('idx_assets_account').on(table.accountId),
    idxAssetsClass: index('idx_assets_class').on(table.assetClass),
    assetClassCheck: check(
      'assets_asset_class_check',
      sql`${table.assetClass} IN ('ppf', 'epf', 'nps', 'fd', 'gold', 'real_estate', 'cash')`,
    ),
    valuationStrategyCheck: check(
      'assets_valuation_strategy_check',
      sql`${table.valuationStrategy} IN ('computed', 'manual')`,
    ),
    ingestionModeCheck: check(
      'assets_ingestion_mode_check',
      sql`${table.ingestionMode} IN ('manual_entry', 'file_import')`,
    ),
    statusCheck: check(
      'assets_status_check',
      sql`${table.status} IN ('active', 'closed')`,
    ),
  }),
);

export const assetContributions = sqliteTable(
  'asset_contributions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    assetId: integer('asset_id')
      .notNull()
      .references(() => assets.id),
    contributionDate: text('contribution_date').notNull(),
    amount: real('amount').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idxContributionsAsset: index('idx_asset_contributions_asset').on(
      table.assetId,
      table.contributionDate,
    ),
  }),
);

export const assetRates = sqliteTable(
  'asset_rates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    assetId: integer('asset_id')
      .notNull()
      .references(() => assets.id),
    effectiveFrom: text('effective_from').notNull(),
    rate: real('rate').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    uniqueAssetEffective: unique().on(table.assetId, table.effectiveFrom),
    idxRatesAsset: index('idx_asset_rates_asset').on(
      table.assetId,
      table.effectiveFrom,
    ),
  }),
);

export const assetValuations = sqliteTable(
  'asset_valuations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    assetId: integer('asset_id')
      .notNull()
      .references(() => assets.id),
    value: real('value').notNull(),
    valuedAt: text('valued_at').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    idxValuationsAsset: index('idx_asset_valuations_asset').on(
      table.assetId,
      table.valuedAt,
    ),
  }),
);

export const liabilities = sqliteTable(
  'liabilities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id').references(() => accounts.id),
    name: text('name').notNull(),
    loanType: text('loan_type', {
      enum: ['home', 'car', 'personal', 'other'],
    }).notNull(),
    principal: real('principal').notNull(),
    annualRate: real('annual_rate').notNull(),
    tenureMonths: integer('tenure_months'),
    emiAmount: real('emi_amount'),
    startDate: text('start_date').notNull(),
    status: text('status', { enum: ['active', 'closed'] })
      .notNull()
      .default('active'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    loanTypeCheck: check(
      'liabilities_loan_type_check',
      sql`${table.loanType} IN ('home', 'car', 'personal', 'other')`,
    ),
    statusCheck: check(
      'liabilities_status_check',
      sql`${table.status} IN ('active', 'closed')`,
    ),
    tenureOrEmiCheck: check(
      'liabilities_tenure_or_emi_check',
      sql`${table.tenureMonths} IS NOT NULL OR ${table.emiAmount} IS NOT NULL`,
    ),
  }),
);
