import { useState } from 'react';
import { Markdown } from './Markdown';
import { StepsTrail } from './StepsTrail';
import { QuestionChips } from './QuestionChips';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
  steps?: string[];
  question?: { question: string; options: { label: string }[] };
};

type ChatPanelProps = {
  chat: {
    messages: ChatMessage[];
    send: (text: string) => Promise<void>;
    isStreaming: boolean;
    error: string | null;
    threadId: string | null;
    clearChat: () => void;
  };
  emptyState?: React.ReactNode;
  placeholder?: string;
};

export function ChatPanel({ chat, emptyState, placeholder = 'Ask your wealth manager…' }: ChatPanelProps) {
  const { messages, send, isStreaming, clearChat } = chat;
  const [draft, setDraft] = useState('');

  async function onSend(text?: string) {
    const payload = (text ?? draft).trim();
    if (!payload) return;
    setDraft('');
    await send(payload);
  }

  return (
    <div className="flex flex-col h-full">
      {messages.length > 0 && (
        <div className="flex justify-end px-1 pb-2">
          <button
            type="button"
            onClick={() => clearChat()}
            disabled={isStreaming}
            className="text-xs px-3 py-1.5 rounded-full border border-border text-ink-muted hover:bg-surface hover:text-ink transition-colors duration-200 cursor-pointer disabled:opacity-50"
          >
            New chat
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto space-y-4 p-1">
        {messages.length === 0 && emptyState}
        {messages.map((m, i) => {
          const isError = m.role === 'assistant' && m.error;
          const bubbleClass =
            m.role === 'user'
              ? 'max-w-[85%] rounded-2xl rounded-br-md bg-brand text-white px-4 py-2.5 text-sm shadow-sm'
              : isError
                ? 'max-w-[85%] rounded-2xl rounded-bl-md bg-red-50 border border-red-200 text-loss px-4 py-2.5 text-sm whitespace-pre-wrap shadow-card'
                : 'max-w-[85%] rounded-2xl rounded-bl-md bg-surface border border-border px-4 py-2.5 text-sm whitespace-pre-wrap shadow-card';
          return (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={bubbleClass} {...(isError ? { role: 'alert' } : {})}>
                {m.role === 'assistant' && (
                  <div className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${isError ? 'text-loss' : 'text-ai'}`}>
                    {isError ? 'Assistant · Error' : 'Assistant'}
                  </div>
                )}
                {m.role === 'assistant' && !isError && m.steps && m.steps.length > 0 && (
                  <StepsTrail
                    steps={m.steps}
                    streaming={isStreaming && i === messages.length - 1}
                    hasText={!!m.text}
                  />
                )}
                {m.role === 'assistant' && !isError ? (
                  m.text ? (
                    <Markdown>{m.text}</Markdown>
                  ) : (isStreaming && i === messages.length - 1 && !(m.steps && m.steps.length > 0) ? (
                    <span className="inline-flex gap-1 text-ink-muted">
                      <span className="animate-pulse">Thinking</span>
                      <span className="animate-pulse delay-75">…</span>
                    </span>
                  ) : '')
                ) : (
                  m.text || (isStreaming && i === messages.length - 1 ? (
                    <span className="inline-flex gap-1 text-ink-muted">
                      <span className="animate-pulse">Thinking</span>
                      <span className="animate-pulse delay-75">…</span>
                    </span>
                  ) : '')
                )}
                {m.role === 'assistant' && !isError && m.question && (
                  <QuestionChips
                    question={m.question.question}
                    options={m.question.options}
                    onSelect={(label) => void onSend(label)}
                    disabled={isStreaming}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 p-2 border-t border-border bg-surface/80 backdrop-blur rounded-b-card">
        <input
          className="input-field flex-1"
          placeholder={placeholder}
          value={draft}
          disabled={isStreaming}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void onSend(); } }}
        />
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={isStreaming || !draft.trim()}
          onClick={() => void onSend()}
        >
          {isStreaming ? 'Thinking…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
