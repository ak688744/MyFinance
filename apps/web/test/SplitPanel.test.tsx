import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplitPanel } from '../src/features/expenses/SplitPanel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { SplitResult } from '../src/types';

const result: SplitResult = {
  parentId: 1, parentAmount: 8000, detectedTotal: 2000, parsedTotal: 2000,
  matched: true, reconciledAgainst: 'statementTotal', carryover: 6000,
  children: [
    { id: 2, transactionDate: '2026-06-02', description: 'SWIGGY', amount: 500, direction: 'debit', categoryId: 'food', categorySource: 'manual', aiKeyword: null, note: null, tags: [], accountId: null, balance: null, parentTransactionId: 1 },
  ],
};

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('SplitPanel', () => {
  it('shows a matched reconciliation bar and the line items', () => {
    wrap(<SplitPanel result={result} merchantLabel="HDFC CC" categories={[{ id: 'food', name: 'Food' }]} onDone={vi.fn()} />);
    expect(screen.getByText(/matched/i)).toBeTruthy();
    expect(screen.getByText(/SWIGGY/)).toBeTruthy();
  });

  it('shows a carryover / not itemized note', () => {
    wrap(<SplitPanel result={result} merchantLabel="HDFC CC" categories={[{ id: 'food', name: 'Food' }]} onDone={vi.fn()} />);
    expect(screen.getByText(/not itemized|carryover/i)).toBeTruthy();
  });
});
