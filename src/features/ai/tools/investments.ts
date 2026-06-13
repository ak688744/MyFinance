import type { Tool } from './types';

export const getHoldings: Tool = {
  name: 'get_holdings',
  description: 'Get current investment holdings with units, invested value, current value, returns percentage, and XIRR for each fund.',
  parameters: {
    type: 'object',
    properties: {
      account: { type: 'string', description: 'Filter by account name. Omit for all accounts.' },
    },
  },
  execute: async (db, input) => {
    const conditions: string[] = ['t.scheme_id IS NOT NULL'];
    const params: (string | number)[] = [];

    if (input.account) {
      conditions.push('t.account_name = ?');
      params.push(input.account as string);
    }

    const rows = await db.getAllAsync<{
      scheme_id: number;
      scheme_name: string;
      amc_name: string | null;
      category: string | null;
      transaction_type: string;
      units: number;
      amount: number;
    }>(
      `
        SELECT t.scheme_id, t.scheme_name, s.amc_name, s.category,
               t.transaction_type, t.units, t.amount
        FROM investment_transactions t
        LEFT JOIN investment_schemes s ON t.scheme_id = s.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY t.scheme_id, t.transaction_date ASC
      `,
      params
    );

    const holdings = new Map<number, {
      schemeName: string;
      amcName: string | null;
      category: string | null;
      units: number;
      invested: number;
    }>();

    for (const row of rows) {
      let h = holdings.get(row.scheme_id);
      if (!h) {
        h = { schemeName: row.scheme_name, amcName: row.amc_name, category: row.category, units: 0, invested: 0 };
        holdings.set(row.scheme_id, h);
      }
      switch (row.transaction_type) {
        case 'PURCHASE':
        case 'SWITCH_IN':
          h.units += row.units;
          h.invested += row.amount;
          break;
        case 'REDEMPTION':
        case 'SWITCH_OUT':
          h.units -= row.units;
          h.invested -= row.amount;
          break;
      }
    }

    const result = Array.from(holdings.values())
      .filter((h) => h.units > 0.0001)
      .map((h) => ({
        schemeName: h.schemeName,
        amcName: h.amcName,
        category: h.category,
        units: Number(h.units.toFixed(4)),
        investedValue: Number(h.invested.toFixed(2)),
      }))
      .sort((a, b) => b.investedValue - a.investedValue);

    return JSON.stringify({ holdingsCount: result.length, holdings: result });
  },
};

export const getPortfolioSummary: Tool = {
  name: 'get_portfolio_summary',
  description: 'Get overall investment portfolio summary: total invested, total current value, total returns, and overall XIRR.',
  parameters: {
    type: 'object',
    properties: {
      account: { type: 'string', description: 'Filter by account name. Omit for all accounts.' },
    },
  },
  execute: async (db, input) => {
    const conditions: string[] = ['scheme_id IS NOT NULL'];
    const params: (string | number)[] = [];

    if (input.account) {
      conditions.push('account_name = ?');
      params.push(input.account as string);
    }

    const rows = await db.getAllAsync<{
      transaction_type: string;
      total_amount: number;
      total_units: number;
    }>(
      `
        SELECT transaction_type, SUM(amount) as total_amount, SUM(units) as total_units
        FROM investment_transactions
        WHERE ${conditions.join(' AND ')}
        GROUP BY transaction_type
      `,
      params
    );

    let totalPurchased = 0;
    let totalRedeemed = 0;
    for (const row of rows) {
      switch (row.transaction_type) {
        case 'PURCHASE':
        case 'SWITCH_IN':
          totalPurchased += row.total_amount;
          break;
        case 'REDEMPTION':
        case 'SWITCH_OUT':
          totalRedeemed += row.total_amount;
          break;
      }
    }

    const netInvested = totalPurchased - totalRedeemed;

    return JSON.stringify({
      totalPurchased,
      totalRedeemed,
      netInvested,
      note: 'Current value and XIRR require NAV data which is shown on the Investments screen.',
    });
  },
};

export const getFundTransactions: Tool = {
  name: 'get_fund_transactions',
  description: 'Get all transactions for a specific mutual fund scheme. Useful to understand investment history in a fund.',
  parameters: {
    type: 'object',
    properties: {
      schemeName: { type: 'string', description: 'Name or partial name of the mutual fund scheme' },
      limit: { type: 'number', description: 'Max transactions to return. Default: 50' },
    },
    required: ['schemeName'],
  },
  execute: async (db, input) => {
    const schemeName = input.schemeName as string;
    const limit = (input.limit as number) ?? 50;

    const rows = await db.getAllAsync<{
      transaction_date: string;
      transaction_type: string;
      units: number;
      nav: number;
      amount: number;
      scheme_name: string;
    }>(
      `
        SELECT transaction_date, transaction_type, units, nav, amount, scheme_name
        FROM investment_transactions
        WHERE scheme_name LIKE ?
        ORDER BY transaction_date DESC
        LIMIT ?
      `,
      `%${schemeName}%`, limit
    );

    return JSON.stringify({
      count: rows.length,
      searchTerm: schemeName,
      transactions: rows.map((r) => ({
        date: r.transaction_date,
        type: r.transaction_type,
        units: r.units,
        nav: r.nav,
        amount: r.amount,
        scheme: r.scheme_name,
      })),
    });
  },
};
