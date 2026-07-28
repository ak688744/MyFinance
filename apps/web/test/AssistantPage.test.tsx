import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../src/features/assistant/useAgentChat', () => ({
  useAgentChat: () => ({
    messages: [
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'Hello! How can I help with your finances?' },
    ],
    send: vi.fn(),
    isStreaming: false,
    error: null,
    threadId: 't1',
  }),
}));

import { AssistantPage } from '../src/features/assistant/AssistantPage';

describe('AssistantPage', () => {
  it('renders the conversation and an input', () => {
    render(<AssistantPage />);
    expect(screen.getByText('hi')).toBeTruthy();
    expect(screen.getByText(/How can I help/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/ask/i)).toBeTruthy();
  });
});
