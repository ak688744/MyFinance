import { useState, type ReactNode } from 'react';
import { ChatPanel, type ChatPanelProps } from './ChatPanel';
import { useAgentThreads } from '../../lib/hooks';
import { formatRelativeDate } from '../../lib/format';
import { SparkleIcon, PlusIcon, HistoryIcon, CloseIcon } from '../../components/ui/icons';

type WorkspaceChat = ChatPanelProps['chat'] & {
  loadThread: (id: string) => Promise<void>;
  loading?: boolean;
};

export type ChatWorkspaceProps = {
  agent: 'wealth' | 'expense' | 'investment';
  chat: WorkspaceChat;
  title: string;
  suggestions?: string[];
  emptyState?: ReactNode;
  placeholder?: string;
  onClose?: () => void;
};

const iconBtn = 'w-8 h-8 flex items-center justify-center rounded-lg border text-ink-muted hover:bg-slate-50 cursor-pointer disabled:opacity-50';

export function ChatWorkspace({ agent, chat, title, suggestions, emptyState, placeholder, onClose }: ChatWorkspaceProps) {
  const [view, setView] = useState<'thread' | 'history'>('thread');
  const threads = useAgentThreads(agent, view === 'history');

  const newChat = () => { chat.clearChat(); setView('thread'); };
  const openThread = async (id: string) => { await chat.loadThread(id); setView('thread'); };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <div className="w-[30px] h-[30px] rounded-lg bg-[#F5F3FF] text-ai flex items-center justify-center">
          <SparkleIcon width={16} height={16} />
        </div>
        <h2 className="font-heading text-[15px] font-semibold text-ink flex-1 truncate">{title}</h2>
        <button type="button" aria-label="New chat" title="New chat" onClick={newChat} disabled={chat.isStreaming} className={`${iconBtn} border-transparent`}>
          <PlusIcon width={16} height={16} />
        </button>
        <button
          type="button"
          aria-label="Chat history"
          aria-pressed={view === 'history'}
          title="Chat history"
          onClick={() => setView((v) => (v === 'history' ? 'thread' : 'history'))}
          className={`${iconBtn} ${view === 'history' ? 'border-ai bg-[#F5F3FF] text-ai' : 'border-transparent'}`}
        >
          <HistoryIcon width={16} height={16} />
        </button>
        {onClose && (
          <button type="button" aria-label="Close" onClick={onClose} className={`${iconBtn} border-transparent`}>
            <CloseIcon width={16} height={16} />
          </button>
        )}
      </div>

      {view === 'thread' ? (
        <div className="flex-1 min-h-0">
          <ChatPanel chat={chat} emptyState={emptyState} placeholder={placeholder} suggestions={suggestions} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-1">
          {threads.isLoading && <div className="px-4 py-6 text-sm text-ink-muted">Loading…</div>}
          {threads.error && <div className="px-4 py-6 text-sm text-loss">Could not load past chats.</div>}
          {!threads.isLoading && !threads.error && (threads.data ?? []).length === 0 && (
            <div className="px-4 py-6 text-sm text-ink-muted">No past chats yet.</div>
          )}
          {(threads.data ?? []).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void openThread(t.id)}
              className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 cursor-pointer ${t.id === chat.threadId ? 'bg-[#F5F3FF]' : ''}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-semibold text-ink truncate">{t.title}</span>
                <span className="text-[11px] text-ink-subtle shrink-0">{formatRelativeDate(t.updatedAt)}</span>
              </div>
              <div className="text-xs text-ink-muted truncate mt-0.5">{t.snippet}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
