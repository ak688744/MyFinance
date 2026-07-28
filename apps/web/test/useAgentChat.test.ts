import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../src/lib/apiStream', () => ({
  streamAgentChat: async function* () {
    yield { type: 'start', threadId: 't1' };
    yield { type: 'token', text: 'Hello' };
    yield { type: 'token', text: ' world' };
    yield { type: 'done', threadId: 't1', usage: { inputTokens: 5, outputTokens: 2 } };
  },
}));

import { useAgentChat } from '../src/features/assistant/useAgentChat';

describe('useAgentChat', () => {
  it('appends a user message and streams the assistant reply', async () => {
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.send('hi'); });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    const msgs = result.current.messages;
    expect(msgs[0]).toEqual({ role: 'user', text: 'hi' });
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].text).toBe('Hello world');
    expect(result.current.threadId).toBe('t1');
    expect(result.current.error).toBeNull();
  });
});
