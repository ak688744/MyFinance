import { describe, it, expect } from 'vitest';
import { filterTools, INVESTMENT_TOOL_ALLOWLIST, buildInvestmentAgent } from '../src/investmentAgent';

describe('investment agent tool filter', () => {
  it('keeps only allowlisted tools, drops expense/loan tools', () => {
    const all = {
      finance_get_investment_portfolio: {},
      finance_analyze_fund_overlap: {},
      finance_refresh_fund_data: {},
      finance_list_transactions: {},
      finance_get_expense_summary: {},
      finance_get_loans_overview: {},
      ask_user: {},
    };
    const filtered = filterTools(all, INVESTMENT_TOOL_ALLOWLIST);
    expect(Object.keys(filtered).sort()).not.toContain('finance_list_transactions');
    expect(Object.keys(filtered)).toContain('finance_analyze_fund_overlap');
    expect(Object.keys(filtered)).toContain('finance_refresh_fund_data');
    expect(Object.keys(filtered)).toContain('ask_user');
  });
});

describe('buildInvestmentAgent', () => {
  it('returns an agent with id investment-analyzer-agent', () => {
    const agent = buildInvestmentAgent({ model: {}, memory: {} as any, tools: {} });
    expect(agent.id).toBe('investment-analyzer-agent');
  });
});
