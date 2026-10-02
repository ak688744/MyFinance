import { describe, it, expect } from 'vitest';
import { filterTools, INVESTMENT_TOOL_ALLOWLIST, buildInvestmentAgent, INVESTMENT_INSTRUCTIONS } from '../src/investmentAgent';

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

describe('performance tools and instructions', () => {
  it('allowlists the performance tools', () => {
    for (const t of [
      'finance_get_fund_performance', 'finance_compare_to_benchmark', 'finance_get_category_stats', 'finance_screen_category',
      'finance_replay_cashflows', 'finance_get_lots_and_tax', 'finance_estimate_switch_cost', 'finance_fetch_fund_details',
    ]) expect(INVESTMENT_TOOL_ALLOWLIST).toContain(t);
  });
  it('instructs analysis-not-advice, tax checks and recency caveats', () => {
    expect(INVESTMENT_INSTRUCTIONS).toMatch(/not advice/i);
    expect(INVESTMENT_INSTRUCTIONS).toMatch(/get_lots_and_tax/);
    expect(INVESTMENT_INSTRUCTIONS).toMatch(/recency/i);
  });
});
