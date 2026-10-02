import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanel } from './ChatPanel';

const base = { send: async () => {}, isStreaming: false, error: null, threadId: 't', clearChat: () => {} };
const fakeChat = { ...base, messages: [{ role: 'assistant' as const, text: 'Hello **world**' }] };

const questionMsg = {
  role: 'assistant' as const,
  text: '',
  question: { question: 'Prepay or invest?', options: [{ label: 'Prepay' }, { label: 'Invest' }] },
};

describe('ChatPanel', () => {
  it('renders assistant markdown message', () => {
    render(<ChatPanel chat={fakeChat as any} />);
    expect(screen.getByText('world')).toBeInTheDocument();
  });

  it('shows option chips while a question is unanswered', () => {
    const send = vi.fn(async () => {});
    render(<ChatPanel chat={{ ...base, send, messages: [{ role: 'user', text: 'hi' }, questionMsg] } as any} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepay' }));
    expect(send).toHaveBeenCalledWith('Prepay');
  });

  it('hides chips and shows a Replied caption once answered', () => {
    const messages = [{ role: 'user', text: 'hi' }, questionMsg, { role: 'user', text: 'Prepay' }, { role: 'assistant', text: 'Done.' }];
    render(<ChatPanel chat={{ ...base, messages } as any} />);
    expect(screen.queryByRole('button', { name: 'Invest' })).toBeNull();
    expect(screen.getByText('Replied · Prepay')).toBeInTheDocument();
  });

  it('shows suggestions only before the first user message', () => {
    const { rerender } = render(<ChatPanel chat={{ ...base, messages: [] } as any} suggestions={['Why more?']} />);
    expect(screen.getByRole('button', { name: 'Why more?' })).toBeInTheDocument();
    rerender(<ChatPanel chat={{ ...base, messages: [{ role: 'user', text: 'x' }] } as any} suggestions={['Why more?']} />);
    expect(screen.queryByRole('button', { name: 'Why more?' })).toBeNull();
  });
});
