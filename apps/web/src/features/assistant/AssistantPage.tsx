import { useState } from 'react';
import { useAgentChat } from './useAgentChat';

const SUGGESTED_PROMPTS = [
  'What is my current net worth breakdown?',
  'How did I spend last month?',
  'Show my top mutual fund holdings',
  'What loans do I have outstanding?',
];

export function AssistantPage() {
  const { messages, send, isStreaming, error } = useAgentChat();
  const [draft, setDraft] = useState('');

  async function onSend(text?: string) {
    const payload = (text ?? draft).trim();
    if (!payload) return;
    setDraft('');
    await send(payload);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      <div className="flex-1 overflow-y-auto space-y-4 p-1">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-ai/20 to-ai/5 text-ai flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              AI
            </div>
            <h2 className="font-heading font-semibold text-lg text-ink">Wealth Manager Assistant</h2>
            <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto leading-relaxed">
              Ask about net worth, investments, spending, or loans. I can also add, categorize, or update transactions — I&apos;ll confirm before anything destructive.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-6 max-w-lg mx-auto">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void onSend(prompt)}
                  disabled={isStreaming}
                  className="text-xs px-3 py-2 rounded-full border border-ai/30 bg-ai/5 text-ai hover:bg-ai/10 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-md bg-brand text-white px-4 py-2.5 text-sm shadow-sm'
                  : 'max-w-[85%] rounded-2xl rounded-bl-md bg-surface border border-border px-4 py-2.5 text-sm whitespace-pre-wrap shadow-card'
              }
            >
              {m.role === 'assistant' && (
                <div className="text-[10px] font-semibold uppercase tracking-wide text-ai mb-1">Assistant</div>
              )}
              {m.text || (isStreaming && i === messages.length - 1 ? (
                <span className="inline-flex gap-1 text-ink-muted">
                  <span className="animate-pulse">Thinking</span>
                  <span className="animate-pulse delay-75">…</span>
                </span>
              ) : '')}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="text-loss text-sm px-2 py-2 bg-red-50 border border-red-100 rounded-lg mx-1 mb-2">
          {error}
        </div>
      )}

      <div className="flex gap-2 p-2 border-t border-border bg-surface/80 backdrop-blur rounded-b-card">
        <input
          className="input-field flex-1"
          placeholder="Ask your wealth manager…"
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
