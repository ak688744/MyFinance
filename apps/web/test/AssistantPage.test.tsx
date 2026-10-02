import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const render = (ui: ReactNode) =>
  rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const hookState = vi.hoisted(() => ({
  value: {
    messages: [
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'Hello! How can I help with your finances?' },
    ] as any[],
    send: vi.fn(),
    isStreaming: false,
    error: null as string | null,
    threadId: 't1' as string | null,
    clearChat: vi.fn(),
    loadThread: vi.fn(async () => {}),
    loading: false,
  },
}));

vi.mock('../src/features/assistant/useAgentChat', () => ({
  useAgentChat: () => hookState.value,
}));

import { AssistantPage } from '../src/features/assistant/AssistantPage';

describe('AssistantPage', () => {
  it('renders the conversation and an input', () => {
    render(<AssistantPage />);
    expect(screen.getByText('hi')).toBeTruthy();
    expect(screen.getByText(/How can I help/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/ask/i)).toBeTruthy();
  });

  it('renders an error-flagged assistant message with an alert role', () => {
    hookState.value = {
      ...hookState.value,
      messages: [
        { role: 'user', text: 'hi' },
        { role: 'assistant', text: 'The AI provider is temporarily unavailable.', error: true },
      ],
    };
    render(<AssistantPage />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('temporarily unavailable');
  });

  it('renders question chips for an assistant message carrying a question', () => {
    const send = vi.fn();
    hookState.value = {
      ...hookState.value,
      send,
      messages: [
        { role: 'user', text: 'should I prepay?' },
        {
          role: 'assistant',
          text: '',
          question: { question: 'Prepay or invest?', options: [{ label: 'Prepay' }, { label: 'Invest' }] },
        },
      ],
    };
    render(<AssistantPage />);
    expect(screen.getByText('Prepay or invest?')).toBeTruthy();
    const chip = screen.getByRole('button', { name: 'Prepay' });
    chip.click();
    expect(send).toHaveBeenCalledWith('Prepay');
  });

  it('History toggle lists past threads and clicking one loads it', async () => {
    const loadThread = vi.fn(async () => {});
    hookState.value = { ...hookState.value, loadThread };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: 'th1', title: 'Net worth check', snippet: 'You have 10L', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' }],
    }), { status: 200 })));
    render(<AssistantPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Chat history' }));
    const row = await screen.findByText('Net worth check');
    expect(screen.getByText('You have 10L')).toBeTruthy();
    fireEvent.click(row);
    await waitFor(() => expect(loadThread).toHaveBeenCalledWith('th1'));
    vi.unstubAllGlobals();
  });
});
