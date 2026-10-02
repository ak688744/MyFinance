import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const render = (ui: ReactNode) =>
  rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const useAgentChat = vi.hoisted(() => vi.fn());
vi.mock('../src/features/assistant/useAgentChat', () => ({ useAgentChat }));

import { AskAiFab } from '../src/features/assistant/AskAiFab';

function chatStub() {
  return {
    messages: [], send: vi.fn(), isStreaming: false, error: null, threadId: null,
    clearChat: vi.fn(), loadThread: vi.fn(async () => {}), loading: false,
  };
}

describe('AskAiFab', () => {
  it('is closed until the button is clicked, then shows the chat with suggestions', () => {
    useAgentChat.mockReturnValue(chatStub());
    render(
      <AskAiFab agent="wealth" storageKey="k" title="Ask AI" ariaLabel="Ask AI about investments"
        placeholder="Ask about your investments…" suggestions={['Which funds are dragging my returns?']} />,
    );
    expect(screen.queryByPlaceholderText('Ask about your investments…')).toBeNull();
    fireEvent.click(screen.getByLabelText('Ask AI about investments'));
    expect(screen.getByPlaceholderText('Ask about your investments…')).toBeTruthy();
    expect(screen.getByText('Which funds are dragging my returns?')).toBeTruthy();
  });

  it('keeps this surface chat separate via its own storage key and agent', () => {
    useAgentChat.mockReturnValue(chatStub());
    render(<AskAiFab agent="wealth" storageKey="myfinance.investments.chat.v1" title="Ask AI" ariaLabel="Ask AI" />);
    expect(useAgentChat).toHaveBeenCalledWith({ agent: 'wealth', storageKey: 'myfinance.investments.chat.v1' });
  });
});
