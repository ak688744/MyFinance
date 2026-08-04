import { useAgentChat } from './useAgentChat';
import { ChatPanel } from './ChatPanel';

const SUGGESTED_PROMPTS = [
  'What is my current net worth breakdown?',
  'How did I spend last month?',
  'Show my top mutual fund holdings',
  'What loans do I have outstanding?',
];

export function AssistantPage() {
  const chat = useAgentChat();

  const emptyState = (
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
            onClick={() => void chat.send(prompt)}
            disabled={chat.isStreaming}
            className="text-xs px-3 py-2 rounded-full border border-ai/30 bg-ai/5 text-ai hover:bg-ai/10 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-7rem)] max-w-3xl mx-auto">
      <ChatPanel chat={chat} emptyState={emptyState} placeholder="Ask your wealth manager…" />
    </div>
  );
}
