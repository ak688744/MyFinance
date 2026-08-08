import { describe, it, expect } from 'vitest';
import { EXPENSE_INSTRUCTIONS } from '../src/expenseAgent';

describe('expense agent CC-bill instruction', () => {
  it('instructs tagging credit-card bills as credit_card_bill', () => {
    expect(EXPENSE_INSTRUCTIONS).toMatch(/credit_card_bill/);
    expect(EXPENSE_INSTRUCTIONS.toLowerCase()).toMatch(/credit[- ]card bill/);
  });
});
