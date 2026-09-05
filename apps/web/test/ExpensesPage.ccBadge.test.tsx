import { describe, it, expect } from 'vitest';
import { isCreditCardBill, isSplitContainer, applyCategoryFilters } from '../src/features/expenses/ExpensesPage';
import type { ExpenseRow } from '../src/types';

const row = (over: Partial<ExpenseRow>): ExpenseRow => ({
  id: 1, transactionDate: '2026-06-15', description: 'HDFC CC PAYMENT', amount: 8000,
  direction: 'debit', categoryId: null, categorySource: null, aiKeyword: null, note: null,
  tags: [], accountId: null, balance: null, parentTransactionId: null, ...over,
});

describe('CC-bill detection helpers', () => {
  it('detects by category', () => {
    expect(isCreditCardBill(row({ categoryId: 'credit_card_bill' }))).toBe(true);
  });
  it('detects by tag', () => {
    expect(isCreditCardBill(row({ tags: [{ tag: 'credit_card_bill', source: 'agent' }] }))).toBe(true);
  });
  it('is false otherwise', () => {
    expect(isCreditCardBill(row({}))).toBe(false);
  });
  it('isSplitContainer true when another row points to it', () => {
    const rows = [row({ id: 1 }), row({ id: 2, parentTransactionId: 1 })];
    expect(isSplitContainer(rows[0], rows)).toBe(true);
    expect(isSplitContainer(rows[1], rows)).toBe(false);
  });
});

describe('applyCategoryFilters', () => {
  it('uncategorized-only filter includes CC split children with null category', () => {
    const rows = [
      row({ id: 1, categoryId: 'bills' }),
      row({ id: 2, parentTransactionId: 1, description: 'Amazon Pay Flights' }),
    ];
    const filtered = applyCategoryFilters(rows, ['__uncategorized__']);
    expect(filtered.map((r) => r.id)).toEqual([2]);
  });
});
