import { useState } from 'react';
import { Markdown } from './Markdown';
import { StepsTrail } from './StepsTrail';
import { QuestionChips } from './QuestionChips';
import { SparkleIcon, SendIcon } from '../../components/ui/icons';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
  steps?: string[];
  question?: { question: string; options: { label: string }[] };
};

export type ChatPanelProps = {
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
  suggestions?: string[];
};

const THINKING = (
  <span className="inline-flex gap-1 text-ink-muted">
    <span className="animate-pulse">Thinking</span>
    <span className="animate-pulse delay-75">…</span>
  </span>
);

export function ChatPanel({ chat, emptyState, placeholder = 'Ask your wealth manager…', suggestions }: ChatPanelProps) {
  const { messages, send, isStreaming } = chat;
  const [draft, setDraft] = useState('');

  async function onSend(text?: string) {
    const payload = (text ?? draft).trim();
    if (!payload || isStreaming) return;
    setDraft('');
    await send(payload);
  }

  const hasUserMessage = messages.some((m) => m.role === 'user');
  const showSuggestions = !!suggestions?.length && !hasUserMessage;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.length === 0 && emptyState}
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          if (m.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-[10px] rounded-br-sm bg-brand text-white px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
                  {m.text || (isStreaming && isLast ? THINKING : '')}
                </div>
              </div>
            );
          }
          const isError = !!m.error;
          const nextUser = messages.slice(i + 1).find((x) => x.role === 'user');
          return (
            <div key={i} className="flex gap-2 items-start">
              <div className="w-6 h-6 shrink-0 rounded-full bg-[#F5F3FF] text-ai flex items-center justify-center">
                <SparkleIcon width={13} height={13} />
              </div>
              <div className="max-w-[calc(100%-2rem)] min-w-0">
                <div
                  className={
                    isError
                      ? 'rounded-[10px] rounded-bl-sm bg-red-50 border border-red-200 text-loss px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap'
                      : 'rounded-[10px] rounded-bl-sm bg-[#F5F3FF] text-ink px-3 py-2 text-[13px] leading-relaxed'
                  }
                  {...(isError ? { role: 'alert' } : {})}
                >
                  {isError && (
                    <div className="text-[10px] font-semibold uppercase tracking-wide mb-1 text-loss">Assistant · Error</div>
                  )}
                  {!isError && m.steps && m.steps.length > 0 && (
                    <StepsTrail steps={m.steps} streaming={isStreaming && isLast} hasText={!!m.text} />
                  )}
                  {isError ? (
                    m.text
                  ) : m.text ? (
                    <Markdown>{m.text}</Markdown>
                  ) : isStreaming && isLast && !(m.steps && m.steps.length > 0) ? (
                    THINKING
                  ) : (
                    ''
                  )}
                  {!isError && m.question && (
                    <QuestionChips
                      question={m.question.question}
                      options={m.question.options}
                      onSelect={(label) => void onSend(label)}
                      disabled={isStreaming}
                      answeredWith={nextUser ? nextUser.text : undefined}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showSuggestions && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {suggestions!.map((s) => (
            <button
              key={s}
              type="button"
              disabled={isStreaming}
              onClick={() => void onSend(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-[#F1F5F9] text-ink-muted hover:bg-slate-200 transition-colors duration-200 cursor-pointer disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 p-3 border-t border-border">
        <input
          className="flex-1 min-w-0 rounded-[10px] border border-border px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ai/40"
          placeholder={placeholder}
          value={draft}
          disabled={isStreaming}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void onSend(); } }}
        />
        <button
          type="button"
          aria-label="Send"
          className="w-[38px] h-[38px] shrink-0 rounded-[10px] bg-ai text-white flex items-center justify-center hover:opacity-90 disabled:opacity-50 cursor-pointer"
          disabled={isStreaming || !draft.trim()}
          onClick={() => void onSend()}
        >
          <SendIcon width={16} height={16} />
        </button>
      </div>
    </div>
  );
}
