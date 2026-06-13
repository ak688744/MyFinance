import type { Tool } from './types';

export const searchTransactions: Tool = {
  name: 'search_transactions',
  description: 'Search transactions by keyword in description, amount range, category, or date range. Returns matching transactions.',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: 'Search keyword in transaction description' },
      startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
      endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      minAmount: { type: 'number', description: 'Minimum amount' },
      maxAmount: { type: 'number', description: 'Maximum amount' },
      category: { type: 'string', description: 'Category name filter' },
      direction: { type: 'string', enum: ['debit', 'credit'], description: 'Transaction direction' },
      limit: { type: 'number', description: 'Max results to return. Default: 20' },
    },
  },
  execute: async (db, input) => {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (input.keyword) {
      conditions.push('t.description LIKE ?');
      params.push(`%${input.keyword}%`);
    }
    if (input.startDate) {
      conditions.push('t.transaction_date >= ?');
      params.push(input.startDate as string);
    }
    if (input.endDate) {
      conditions.push('t.transaction_date <= ?');
      params.push(input.endDate as string);
    }
    if (input.minAmount) {
      conditions.push('t.amount >= ?');
      params.push(input.minAmount as number);
    }
    if (input.maxAmount) {
      conditions.push('t.amount <= ?');
      params.push(input.maxAmount as number);
    }
    if (input.category) {
      conditions.push('c.name = ?');
      params.push(input.category as string);
    }
    if (input.direction) {
      conditions.push('t.direction = ?');
      params.push(input.direction as string);
    }

    const limit = (input.limit as number) ?? 20;
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await db.getAllAsync<{
      transaction_date: string;
      description: string;
      amount: number;
      direction: string;
      category_name: string | null;
    }>(
      `
        SELECT
          t.transaction_date,
          t.description,
          t.amount,
          t.direction,
          c.name as category_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        ${whereClause}
        ORDER BY t.transaction_date DESC
        LIMIT ?
      `,
      ...params, limit
    );

    return JSON.stringify({
      count: rows.length,
      transactions: rows.map((r) => ({
        date: r.transaction_date,
        description: r.description,
        amount: r.amount,
        direction: r.direction,
        category: r.category_name ?? 'Uncategorized',
      })),
    });
  },
};

export const getRecentTransactions: Tool = {
  name: 'get_recent_transactions',
  description: 'Get the most recent transactions. Useful for answering "what were my last few transactions?"',
  parameters: {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Number of recent transactions. Default: 10' },
      direction: { type: 'string', enum: ['debit', 'credit'], description: 'Filter by direction' },
    },
  },
  execute: async (db, input) => {
    const count = (input.count as number) ?? 10;
    const dirFilter = input.direction ? 'AND t.direction = ?' : '';
    const params: (string | number)[] = input.direction ? [input.direction as string, count] : [count];

    const rows = await db.getAllAsync<{
      transaction_date: string;
      description: string;
      amount: number;
      direction: string;
      category_name: string | null;
    }>(
      `
        SELECT
          t.transaction_date,
          t.description,
          t.amount,
          t.direction,
          c.name as category_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE 1=1 ${dirFilter}
        ORDER BY t.transaction_date DESC
        LIMIT ?
      `,
      ...params
    );

    return JSON.stringify({
      transactions: rows.map((r) => ({
        date: r.transaction_date,
        description: r.description,
        amount: r.amount,
        direction: r.direction,
        category: r.category_name ?? 'Uncategorized',
      })),
    });
  },
};
