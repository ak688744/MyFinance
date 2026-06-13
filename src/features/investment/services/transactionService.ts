import type { SQLiteDatabase } from 'expo-sqlite';

export type TransactionType =
  | 'PURCHASE'
  | 'REDEMPTION'
  | 'SWITCH_IN'
  | 'SWITCH_OUT'
  | 'DIVIDEND';

export type InvestmentTransaction = {
  id: number;
  schemeId: number | null;
  schemeName: string;
  accountName: string;
  investmentApp: string;
  transactionType: TransactionType;
  units: number;
  nav: number;
  amount: number;
  transactionDate: string;
};

export type TransactionSummary = {
  totalPurchases: number;
  totalRedemptions: number;
  netInvestment: number;
  transactionCount: number;
};

type TransactionFilters = {
  account?: string;
  schemeId?: number;
  schemeName?: string;
  type?: TransactionType;
  startDate?: string;
  endDate?: string;
  limit?: number;
};

type SummaryFilters = {
  account?: string;
  startDate?: string;
  endDate?: string;
};

type CashFlowFilters = {
  account?: string;
  schemeId?: number;
  startDate?: string;
  endDate?: string;
};

type DbTransaction = {
  id: number;
  scheme_id: number | null;
  scheme_name: string;
  account_name: string;
  investment_app: string;
  transaction_type: TransactionType;
  units: number;
  nav: number;
  amount: number;
  transaction_date: string;
};

function mapDbToTransaction(row: DbTransaction): InvestmentTransaction {
  return {
    id: row.id,
    schemeId: row.scheme_id,
    schemeName: row.scheme_name,
    accountName: row.account_name,
    investmentApp: row.investment_app,
    transactionType: row.transaction_type,
    units: row.units,
    nav: row.nav,
    amount: row.amount,
    transactionDate: row.transaction_date,
  };
}

export async function getTransactions(
  db: SQLiteDatabase,
  filters?: TransactionFilters
): Promise<InvestmentTransaction[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.account) {
    conditions.push('account_name = ?');
    params.push(filters.account);
  }

  if (filters?.schemeId !== undefined) {
    conditions.push('scheme_id = ?');
    params.push(filters.schemeId);
  }

  if (filters?.schemeName) {
    conditions.push('scheme_name = ?');
    params.push(filters.schemeName);
  }

  if (filters?.type) {
    conditions.push('transaction_type = ?');
    params.push(filters.type);
  }

  if (filters?.startDate && filters?.endDate) {
    conditions.push('transaction_date BETWEEN ? AND ?');
    params.push(filters.startDate, filters.endDate);
  } else if (filters?.startDate) {
    conditions.push('transaction_date >= ?');
    params.push(filters.startDate);
  } else if (filters?.endDate) {
    conditions.push('transaction_date <= ?');
    params.push(filters.endDate);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitClause = filters?.limit ? `LIMIT ?` : '';

  if (filters?.limit) {
    params.push(filters.limit);
  }

  const query = `
    SELECT
      id,
      scheme_id,
      scheme_name,
      account_name,
      investment_app,
      transaction_type,
      units,
      nav,
      amount,
      transaction_date
    FROM investment_transactions
    ${whereClause}
    ORDER BY transaction_date DESC
    ${limitClause}
  `;

  const rows = await db.getAllAsync<DbTransaction>(query, params);
  return rows.map(mapDbToTransaction);
}

export async function getTransactionsByScheme(
  db: SQLiteDatabase,
  schemeId: number
): Promise<InvestmentTransaction[]> {
  const rows = await db.getAllAsync<DbTransaction>(
    `
    SELECT
      id,
      scheme_id,
      scheme_name,
      account_name,
      investment_app,
      transaction_type,
      units,
      nav,
      amount,
      transaction_date
    FROM investment_transactions
    WHERE scheme_id = ?
    ORDER BY transaction_date DESC
    `,
    schemeId
  );

  return rows.map(mapDbToTransaction);
}

export async function getTransactionSummary(
  db: SQLiteDatabase,
  filters?: SummaryFilters
): Promise<TransactionSummary> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.account) {
    conditions.push('account_name = ?');
    params.push(filters.account);
  }

  if (filters?.startDate && filters?.endDate) {
    conditions.push('transaction_date BETWEEN ? AND ?');
    params.push(filters.startDate, filters.endDate);
  } else if (filters?.startDate) {
    conditions.push('transaction_date >= ?');
    params.push(filters.startDate);
  } else if (filters?.endDate) {
    conditions.push('transaction_date <= ?');
    params.push(filters.endDate);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type IN ('PURCHASE', 'SWITCH_IN') THEN amount ELSE 0 END), 0) as total_purchases,
      COALESCE(SUM(CASE WHEN transaction_type IN ('REDEMPTION', 'SWITCH_OUT', 'DIVIDEND') THEN amount ELSE 0 END), 0) as total_redemptions,
      COUNT(*) as transaction_count
    FROM investment_transactions
    ${whereClause}
  `;

  const result = await db.getFirstAsync<{
    total_purchases: number;
    total_redemptions: number;
    transaction_count: number;
  }>(query, params);

  const totalPurchases = result?.total_purchases ?? 0;
  const totalRedemptions = result?.total_redemptions ?? 0;

  return {
    totalPurchases,
    totalRedemptions,
    netInvestment: totalPurchases - totalRedemptions,
    transactionCount: result?.transaction_count ?? 0,
  };
}

export async function getCashFlows(
  db: SQLiteDatabase,
  filters?: CashFlowFilters
): Promise<Array<{ date: string; amount: number }>> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters?.account) {
    conditions.push('account_name = ?');
    params.push(filters.account);
  }

  if (filters?.schemeId !== undefined) {
    conditions.push('scheme_id = ?');
    params.push(filters.schemeId);
  }

  if (filters?.startDate && filters?.endDate) {
    conditions.push('transaction_date BETWEEN ? AND ?');
    params.push(filters.startDate, filters.endDate);
  } else if (filters?.startDate) {
    conditions.push('transaction_date >= ?');
    params.push(filters.startDate);
  } else if (filters?.endDate) {
    conditions.push('transaction_date <= ?');
    params.push(filters.endDate);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // For XIRR calculation:
  // - PURCHASE/SWITCH_IN = negative (money going out from investor)
  // - REDEMPTION/SWITCH_OUT/DIVIDEND = positive (money coming back to investor)
  const query = `
    SELECT
      transaction_date as date,
      CASE
        WHEN transaction_type IN ('PURCHASE', 'SWITCH_IN') THEN -amount
        ELSE amount
      END as amount
    FROM investment_transactions
    ${whereClause}
    ORDER BY transaction_date ASC
  `;

  const rows = await db.getAllAsync<{ date: string; amount: number }>(
    query,
    params
  );

  return rows;
}
