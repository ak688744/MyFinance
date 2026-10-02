import { useAgentChat } from './useAgentChat';
import { ChatWorkspace } from './ChatWorkspace';

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
    </div>
  );

  return (
    <div className="h-[calc(100vh-7rem)] max-w-3xl mx-auto bg-white rounded-card border border-border shadow-card overflow-hidden">
      <ChatWorkspace
        agent="wealth"
        chat={chat}
        title="Wealth Assistant"
        suggestions={SUGGESTED_PROMPTS}
        emptyState={emptyState}
        placeholder="Ask your wealth manager…"
      />
    </div>
  );
}
