import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CategoryChip } from './CategoryChip';
import * as hooks from '../../lib/hooks';

const cats = [{ id: 'food', name: 'Food' }];

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('CategoryChip ai_suggested state', () => {
  const mutateAsync = vi.fn().mockResolvedValue({ ok: true });
  beforeEach(() => {
    mutateAsync.mockClear();
    vi.spyOn(hooks, 'useUpdateTxCategory').mockReturnValue({ mutateAsync, isPending: false, error: null } as any);
  });

  it('renders an AI suggestion with confirm/cancel', () => {
    wrap(<CategoryChip txId={1} categoryId="food" categorySource="ai_suggested" aiKeyword="swiggy" merchantLabel="SWIGGY ORDER 1" categories={cats} />);
    expect(screen.getByText(/AI/i)).toBeInTheDocument();
    expect(screen.getByText(/AI · Food/)).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm AI suggestion')).toBeInTheDocument();
    expect(screen.getByLabelText('Reject AI suggestion')).toBeInTheDocument();
  });

  it('confirm → one-off assign, then shows the keyword second prompt', async () => {
    wrap(<CategoryChip txId={1} categoryId="food" categorySource="ai_suggested" aiKeyword="swiggy" merchantLabel="SWIGGY ORDER 1" categories={cats} />);
    fireEvent.click(screen.getByLabelText('Confirm AI suggestion'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 1, categoryId: 'food' }));
    expect(await screen.findByText(/Always categorize transactions containing/i)).toBeInTheDocument();
  });

  it('Yes on the second prompt creates a keyword rule', async () => {
    wrap(<CategoryChip txId={1} categoryId="food" categorySource="ai_suggested" aiKeyword="swiggy" merchantLabel="SWIGGY ORDER 1" categories={cats} />);
    fireEvent.click(screen.getByLabelText('Confirm AI suggestion'));
    fireEvent.click(await screen.findByText('Yes'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 1, categoryId: 'food', createRuleKeyword: true, keyword: 'swiggy' }));
  });

  it('keyword prompt survives an invalidation-driven re-render to categorySource=manual', async () => {
    const { rerender } = wrap(
      <CategoryChip txId={1} categoryId="food" categorySource="ai_suggested" aiKeyword="swiggy" merchantLabel="SWIGGY ORDER 1" categories={cats} />,
    );
    fireEvent.click(screen.getByLabelText('Confirm AI suggestion'));
    expect(await screen.findByText(/Always categorize transactions containing/i)).toBeInTheDocument();

    // Simulate the post-refetch state: the one-off assign flipped the row to 'manual'.
    // The prompt must remain because it is gated on local aiConfirmed state.
    const qc = new QueryClient();
    rerender(
      <QueryClientProvider client={qc}>
        <CategoryChip txId={1} categoryId="food" categorySource="manual" aiKeyword="swiggy" merchantLabel="SWIGGY ORDER 1" categories={cats} />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/Always categorize transactions containing/i)).toBeInTheDocument();
    // And Yes still creates the keyword rule.
    fireEvent.click(screen.getByText('Yes'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 1, categoryId: 'food', createRuleKeyword: true, keyword: 'swiggy' }));
  });

  it('cancel reverts to uncategorized', async () => {
    wrap(<CategoryChip txId={1} categoryId="food" categorySource="ai_suggested" aiKeyword="swiggy" merchantLabel="SWIGGY ORDER 1" categories={cats} />);
    fireEvent.click(screen.getByLabelText('Reject AI suggestion'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: 1, categoryId: null }));
  });
});
