import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAgentChat } from '../assistant/useAgentChat';
import { ChatPanel } from '../assistant/ChatPanel';
import { buildInsightSeed } from './insightSeed';
import type { Insight } from '../../types';

type ExpensesInsightDrawerProps = {
  insight: Insight;
  txns: { id: number; description: string; amount: number }[];
  onClose: () => void;
};

export function ExpensesInsightDrawer({ insight, txns, onClose }: ExpensesInsightDrawerProps) {
  const queryClient = useQueryClient();
  const chat = useAgentChat({ agent: 'expense', persist: false, storageKey: 'myfinance.expense.insight.chat' });
  const fired = useRef(false);

  useEffect(() => {
    if (!fired.current) {
      fired.current = true;
      void chat.send(buildInsightSeed(insight, txns));
    }
  }, []);

  const handleClose = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['expenseInsights'] });
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={handleClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <div>
            <h2 className="font-heading text-lg">{insight.title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{insight.detail}</p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Chat Panel */}
        <div className="flex-1 overflow-hidden">
          <ChatPanel chat={chat} placeholder="Reply…" />
        </div>
      </div>
    </>
  );
}
