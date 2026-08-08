import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplitStatementModal } from '../src/features/expenses/SplitStatementModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('SplitStatementModal', () => {
  it('renders the upload modal with a parse button and password field', () => {
    wrap(<SplitStatementModal open txId={1} merchantLabel="HDFC CC" onClose={vi.fn()} onSplit={vi.fn()} />);
    expect(screen.getByText(/parse statement/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/password/i)).toBeTruthy();
  });
});
