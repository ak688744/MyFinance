import type { Tool } from './types';

export const getSpendingSummary: Tool = {
  name: 'get_spending_summary',
  description: 'Get total spending broken down by category for a given date range. Returns each category with total amount and transaction count.',
  parameters: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
      endDate: { type: 'string', description: 'End date in YYYY-MM-DD format' },
      direction: { type: 'string', enum: ['debit', 'credit'], description: 'Filter by debit (expenses) or credit (income). Default: debit' },
    },
    required: ['startDate', 'endDate'],
  },
  execute: async (db, input) => {
    const startDate = input.startDate as string;
    const endDate = input.endDate as string;
    const direction = (input.direction as string) ?? 'debit';

    const rows = await db.getAllAsync<{
      category_name: string | null;
      total: number;
      count: number;
    }>(
      `
        SELECT
          COALESCE(c.name, 'Uncategorized') as category_name,
          SUM(t.amount) as total,
          COUNT(*) as count
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.transaction_date BETWEEN ? AND ?
          AND t.direction = ?
        GROUP BY COALESCE(c.name, 'Uncategorized')
        ORDER BY total DESC
      `,
      startDate, endDate, direction
    );

    const grandTotal = rows.reduce((s, r) => s + r.total, 0);

    return JSON.stringify({
      period: { startDate, endDate },
      direction,
      grandTotal,
      categories: rows.map((r) => ({
        category: r.category_name,
        amount: r.total,
        transactionCount: r.count,
        percentage: grandTotal > 0 ? ((r.total / grandTotal) * 100).toFixed(1) : '0',
      })),
    });
  },
};

export const getCategoryTrend: Tool = {
  name: 'get_category_trend',
  description: 'Get month-over-month spending trend for a specific category. Shows how spending in that category changed over recent months.',
  parameters: {
    type: 'object',
    properties: {
      categoryName: { type: 'string', description: 'The category name to analyze' },
      months: { type: 'number', description: 'Number of months to look back. Default: 6' },
    },
    required: ['categoryName'],
  },
  execute: async (db, input) => {
    const categoryName = input.categoryName as string;
    const months = (input.months as number) ?? 6;

    const rows = await db.getAllAsync<{
      month: string;
      total: number;
      count: number;
    }>(
      `
        SELECT
          strftime('%Y-%m', t.transaction_date) as month,
          SUM(t.amount) as total,
          COUNT(*) as count
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE c.name = ?
          AND t.direction = 'debit'
          AND t.transaction_date >= date('now', '-' || ? || ' months')
        GROUP BY strftime('%Y-%m', t.transaction_date)
        ORDER BY month ASC
      `,
      categoryName, months
    );

    return JSON.stringify({
      category: categoryName,
      months: rows.map((r) => ({
        month: r.month,
        amount: r.total,
        transactionCount: r.count,
      })),
    });
  },
};

export const getMonthlyComparison: Tool = {
  name: 'get_monthly_comparison',
  description: 'Compare spending between two months, showing differences by category.',
  parameters: {
    type: 'object',
    properties: {
      month1: { type: 'string', description: 'First month in YYYY-MM format' },
      month2: { type: 'string', description: 'Second month in YYYY-MM format' },
    },
    required: ['month1', 'month2'],
  },
  execute: async (db, input) => {
    const month1 = input.month1 as string;
    const month2 = input.month2 as string;

    const getMonthData = async (month: string) => {
      return db.getAllAsync<{ category_name: string | null; total: number }>(
        `
          SELECT
            COALESCE(c.name, 'Uncategorized') as category_name,
            SUM(t.amount) as total
          FROM transactions t
          LEFT JOIN categories c ON t.category_id = c.id
          WHERE strftime('%Y-%m', t.transaction_date) = ?
            AND t.direction = 'debit'
          GROUP BY COALESCE(c.name, 'Uncategorized')
        `,
        month
      );
    };

    const [data1, data2] = await Promise.all([
      getMonthData(month1),
      getMonthData(month2),
    ]);

    const map1 = new Map(data1.map((r) => [r.category_name, r.total]));
    const map2 = new Map(data2.map((r) => [r.category_name, r.total]));
    const allCategories = new Set([...map1.keys(), ...map2.keys()]);

    const comparison = Array.from(allCategories).map((cat) => {
      const a = map1.get(cat) ?? 0;
      const b = map2.get(cat) ?? 0;
      return { category: cat, [month1]: a, [month2]: b, change: b - a };
    });

    comparison.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    const total1 = data1.reduce((s, r) => s + r.total, 0);
    const total2 = data2.reduce((s, r) => s + r.total, 0);

    return JSON.stringify({
      month1: { month: month1, total: total1 },
      month2: { month: month2, total: total2 },
      totalChange: total2 - total1,
      byCategory: comparison,
    });
  },
};
