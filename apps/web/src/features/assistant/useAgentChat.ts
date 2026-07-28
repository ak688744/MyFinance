import { useCallback, useRef, useState } from 'react';
import { streamAgentChat } from '../../lib/apiStream';

export type ChatMessage = { role: 'user' | 'assistant'; text: string };

export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const threadRef = useRef<string | null>(null);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    setError(null);
    setMessages((m) => [...m, { role: 'user', text: trimmed }, { role: 'assistant', text: '' }]);
    setIsStreaming(true);

    try {
      for await (const ev of streamAgentChat({
        threadId: threadRef.current ?? undefined,
        message: trimmed,
      })) {
        if (ev.type === 'start') {
          threadRef.current = ev.threadId;
          setThreadId(ev.threadId);
        } else if (ev.type === 'token') {
          setMessages((m) => {
            const next = m.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { role: 'assistant', text: last.text + ev.text };
            }
            return next;
          });
        } else if (ev.type === 'done') {
          threadRef.current = ev.threadId;
          setThreadId(ev.threadId);
        } else if (ev.type === 'error') {
          setError(ev.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed');
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming]);

  return { messages, send, isStreaming, error, threadId };
}
