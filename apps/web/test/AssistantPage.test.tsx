import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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
});
