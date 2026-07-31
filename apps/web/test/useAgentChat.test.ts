import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const streamMock = vi.hoisted(() => ({ impl: async function* () {} as any }));

vi.mock('../src/lib/apiStream', () => ({
  streamAgentChat: (...args: any[]) => streamMock.impl(...args),
}));

import { useAgentChat, CHAT_STORAGE_KEY } from '../src/features/assistant/useAgentChat';

function setStream(gen: () => AsyncGenerator<any>) {
  streamMock.impl = gen;
}

describe('useAgentChat', () => {
  beforeEach(() => {
    localStorage.clear();
    setStream(async function* () {
      yield { type: 'start', threadId: 't1' };
      yield { type: 'token', text: 'Hello' };
      yield { type: 'token', text: ' world' };
      yield { type: 'done', threadId: 't1', usage: { inputTokens: 5, outputTokens: 2 } };
    });
  });

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

  it('collects step events into the assistant message steps trail', async () => {
    setStream(async function* () {
      yield { type: 'start', threadId: 't1' };
      yield { type: 'step', label: 'Checking net worth' };
      yield { type: 'token', text: 'Your net worth is ₹95.9L.' };
      yield { type: 'step', label: 'Reviewing investments' };
      yield { type: 'token', text: ' Investments are up.' };
      yield { type: 'done', threadId: 't1', usage: { inputTokens: 5, outputTokens: 2 } };
    });
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.send('status?'); });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.role).toBe('assistant');
    expect(last.text).toContain('net worth');
    expect(last.steps).toEqual(['Checking net worth', 'Reviewing investments']);
  });

  it('shows an informative error in the assistant bubble instead of an empty box', async () => {
    setStream(async function* () {
      yield { type: 'start', threadId: 't1' };
      yield { type: 'error', message: 'The AI provider is temporarily unavailable.' };
    });
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.send('hi'); });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.role).toBe('assistant');
    expect(last.error).toBe(true);
    // The bubble text must carry the message — never an empty box.
    expect(last.text).toContain('temporarily unavailable');
    expect(last.text.length).toBeGreaterThan(0);
  });

  it('turns a thrown stream into an error bubble (no empty box)', async () => {
    setStream(async function* () {
      yield { type: 'start', threadId: 't1' };
      throw new Error('network boom');
    });
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.send('hi'); });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.role).toBe('assistant');
    expect(last.error).toBe(true);
    expect(last.text.length).toBeGreaterThan(0);
  });

  it('persists the transcript + threadId to localStorage after a turn', async () => {
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.send('hi'); });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    const saved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) as string);
    expect(saved.threadId).toBe('t1');
    expect(saved.messages).toHaveLength(2);
    expect(saved.messages[1].text).toBe('Hello world');
  });

  it('restores an earlier transcript + threadId on mount (survives reload)', async () => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({
      threadId: 'prev-thread',
      messages: [
        { role: 'user', text: 'earlier question' },
        { role: 'assistant', text: 'earlier answer' },
      ],
    }));
    const { result } = renderHook(() => useAgentChat());
    expect(result.current.threadId).toBe('prev-thread');
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].text).toBe('earlier question');
  });

  it('continues the restored thread on the next send', async () => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({
      threadId: 'prev-thread',
      messages: [{ role: 'user', text: 'q' }, { role: 'assistant', text: 'a' }],
    }));
    let sentThreadId: string | undefined;
    setStream(async function* (body: any) {
      sentThreadId = body.threadId;
      yield { type: 'start', threadId: body.threadId ?? 'new' };
      yield { type: 'token', text: 'ok' };
      yield { type: 'done', threadId: body.threadId ?? 'new', usage: { inputTokens: 1, outputTokens: 1 } };
    });
    const { result } = renderHook(() => useAgentChat());
    await act(async () => { await result.current.send('follow up'); });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(sentThreadId).toBe('prev-thread');
  });

  it('clearChat wipes messages, threadId, and storage', async () => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({
      threadId: 'prev-thread',
      messages: [{ role: 'user', text: 'q' }, { role: 'assistant', text: 'a' }],
    }));
    const { result } = renderHook(() => useAgentChat());
    expect(result.current.messages).toHaveLength(2);
    act(() => { result.current.clearChat(); });
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.threadId).toBeNull();
    expect(localStorage.getItem(CHAT_STORAGE_KEY)).toBeNull();
  });
});
