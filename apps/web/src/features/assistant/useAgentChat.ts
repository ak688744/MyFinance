import { useCallback, useRef, useState } from 'react';
import { streamAgentChat } from '../../lib/apiStream';

export type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
  steps?: string[];
  question?: { question: string; options: { label: string }[] };
};

export const CHAT_STORAGE_KEY = 'myfinance.assistant.chat.v1';

type PersistedChat = { threadId: string | null; messages: ChatMessage[] };

function loadPersisted(storageKey: string): PersistedChat {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { threadId: null, messages: [] };
    const parsed = JSON.parse(raw) as PersistedChat;
    if (!Array.isArray(parsed?.messages)) return { threadId: null, messages: [] };
    return { threadId: parsed.threadId ?? null, messages: parsed.messages };
  } catch {
    return { threadId: null, messages: [] };
  }
}

function persist(chat: PersistedChat, storageKey: string): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(chat));
  } catch {
    // storage unavailable / quota — non-fatal, chat still works in-memory this session.
  }
}

export function useAgentChat(opts?: {
  storageKey?: string;
  persist?: boolean;
  agent?: 'wealth' | 'expense';
}) {
  const storageKey = opts?.storageKey ?? CHAT_STORAGE_KEY;
  const shouldPersist = opts?.persist !== false;
  const initial = shouldPersist ? loadPersisted(storageKey) : { threadId: null, messages: [] };
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(initial.threadId);
  const threadRef = useRef<string | null>(initial.threadId);

  // Persist the full transcript + threadId whenever either settles. Uses a ref
  // snapshot inside the state updater so we always save the freshest arrays.
  const save = useCallback((msgs: ChatMessage[], tid: string | null) => {
    if (shouldPersist) {
      persist({ threadId: tid, messages: msgs }, storageKey);
    }
  }, [shouldPersist, storageKey]);

  const setAssistantError = useCallback((message: string) => {
    setError(message);
    setMessages((m) => {
      const next = m.slice();
      const last = next[next.length - 1];
      // Fold the error into the trailing (empty) assistant bubble so the user
      // sees an informative message, never an empty box.
      if (last && last.role === 'assistant') {
        next[next.length - 1] = { role: 'assistant', text: last.text ? last.text : message, error: true };
        if (last.text) next[next.length - 1].text = `${last.text}\n\n⚠️ ${message}`;
      } else {
        next.push({ role: 'assistant', text: message, error: true });
      }
      save(next, threadRef.current);
      return next;
    });
  }, [save]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    setError(null);
    setMessages((m) => {
      const next = [...m, { role: 'user' as const, text: trimmed }, { role: 'assistant' as const, text: '' }];
      return next;
    });
    setIsStreaming(true);

    try {
      for await (const ev of streamAgentChat({
        threadId: threadRef.current ?? undefined,
        message: trimmed,
        agent: opts?.agent,
      })) {
        if (ev.type === 'start') {
          threadRef.current = ev.threadId;
          setThreadId(ev.threadId);
        } else if (ev.type === 'token') {
          setMessages((m) => {
            const next = m.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, role: 'assistant', text: last.text + ev.text };
            }
            return next;
          });
        } else if (ev.type === 'step') {
          setMessages((m) => {
            const next = m.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, role: 'assistant', steps: [...(last.steps ?? []), ev.label] };
            }
            return next;
          });
        } else if (ev.type === 'question') {
          setMessages((m) => {
            const next = m.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, role: 'assistant', question: { question: ev.question, options: ev.options } };
            }
            return next;
          });
        } else if (ev.type === 'done') {
          threadRef.current = ev.threadId;
          setThreadId(ev.threadId);
          setMessages((m) => { save(m, ev.threadId); return m; });
        } else if (ev.type === 'error') {
          setAssistantError(ev.message);
        }
      }
    } catch (e) {
      setAssistantError(e instanceof Error ? e.message : 'Chat failed');
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, save, setAssistantError]);

  const clearChat = useCallback(() => {
    threadRef.current = null;
    setThreadId(null);
    setMessages([]);
    setError(null);
    if (shouldPersist) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  }, [shouldPersist, storageKey]);

  return { messages, send, isStreaming, error, threadId, clearChat };
}
