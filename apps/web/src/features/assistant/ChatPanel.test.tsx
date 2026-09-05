import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatPanel } from './ChatPanel';

const fakeChat = {
  messages: [{ role: 'assistant' as const, text: 'Hello **world**' }],
  send: async () => {}, isStreaming: false, error: null, threadId: 't', clearChat: () => {},
};

describe('ChatPanel', () => {
  it('renders assistant markdown message', () => {
    render(<ChatPanel chat={fakeChat as any} />);
    expect(screen.getByText('world')).toBeInTheDocument();
  });
});
