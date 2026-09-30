import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAgentChat } from '../assistant/useAgentChat';
import { ChatPanel } from '../assistant/ChatPanel';

type InvestmentInsightDrawerProps = {
  title: string;
  detail: string;
  /** First message sent to the investment agent when the drawer opens. */
  seed: string;
  onClose: () => void;
};

export function InvestmentInsightDrawer({ title, detail, seed, onClose }: InvestmentInsightDrawerProps) {
  const queryClient = useQueryClient();
  const chat = useAgentChat({ agent: 'investment', persist: false, storageKey: 'myfinance.investment.insight.chat' });
  const fired = useRef(false);

  useEffect(() => {
    if (!fired.current) {
      fired.current = true;
      void chat.send(seed);
    }
  }, []);

  const handleClose = () => {
    queryClient.invalidateQueries({ queryKey: ['investments'] });
    queryClient.invalidateQueries({ queryKey: ['investmentInsights'] });
    queryClient.invalidateQueries({ queryKey: ['investmentReview'] });
    queryClient.invalidateQueries({ queryKey: ['networth'] });
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={handleClose}
      />

      <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <div>
            <h2 className="font-heading text-lg">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{detail}</p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          <ChatPanel chat={chat} placeholder="Ask about your portfolio…" />
        </div>
      </div>
    </>
  );
}
