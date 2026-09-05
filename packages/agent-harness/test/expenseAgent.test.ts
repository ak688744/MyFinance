import { describe, it, expect } from 'vitest';
import { filterTools, EXPENSE_TOOL_ALLOWLIST } from '../src/expenseAgent';

describe('expense agent tool filter', () => {
  it('keeps only allowlisted tools, drops investment/loan tools', () => {
    const all = {
      finance_list_transactions: {}, finance_get_expense_summary: {},
      finance_categorize_transaction: {}, finance_tag_transaction: {},
      finance_list_categories: {}, finance_create_rule: {}, finance_create_category: {},
      finance_get_investment_portfolio: {}, finance_get_loans_overview: {},
      ask_user: {},
    };
    const filtered = filterTools(all, EXPENSE_TOOL_ALLOWLIST);
    expect(Object.keys(filtered).sort()).not.toContain('finance_get_investment_portfolio');
    expect(Object.keys(filtered)).toContain('finance_tag_transaction');
    expect(Object.keys(filtered)).toContain('ask_user');
  });
});
