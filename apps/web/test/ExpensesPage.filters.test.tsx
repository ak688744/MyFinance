import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExpensesPage } from '../src/features/expenses/ExpensesPage';

const summary = {
  totalSpent: 0, totalIncome: 0, saved: 0, invested: 0, byCategory: [], byMonth: [],
  balance: { opening: 1000, closing: 2000, net: 1000 },
};

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const path = url.split('?')[0];
    const data = path.endsWith('/expenses/summary') ? summary : [];
    return new Response(JSON.stringify({ data }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

class RO { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal('ResizeObserver', RO); });
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ExpensesPage />
    </QueryClientProvider>,
  );
}

describe('ExpensesPage filter bar', () => {
  it('segmented control changes the direction query and shows the filtered empty state', async () => {
    const fetchMock = mockFetch();
    renderPage();
    expect(await screen.findByText('No transactions this month.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Income' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/expenses?') && String(c[0]).includes('direction=in'))).toBe(true),
    );
    expect(await screen.findByText('No transactions match your filters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('No transactions this month.')).toBeInTheDocument();
  });

  it('renders the Balance card and the AI Insights FAB', async () => {
    mockFetch();
    renderPage();
    expect(await screen.findByText('Opening')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open AI Insights' }));
    expect(screen.getByRole('dialog', { name: 'AI Insights' })).toBeInTheDocument();
  });
});
