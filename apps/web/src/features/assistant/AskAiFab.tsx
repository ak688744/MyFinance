import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Drawer } from '../../components/ui/Drawer';
import { SparkleIcon } from '../../components/ui/icons';
import { ChatWorkspace } from './ChatWorkspace';
import { useAgentChat } from './useAgentChat';

type AskAiFabProps = {
  agent: 'wealth' | 'expense';
  /** localStorage key for this surface's open chat (keeps it separate from other pages). */
  storageKey: string;
  title: string;
  ariaLabel: string;
  placeholder?: string;
  suggestions?: string[];
  /** Query keys to refresh when the panel closes (the agent may have changed data). */
  invalidateOnClose?: string[][];
};

/** Floating purple button that opens a right-hand AI chat drawer with History. */
export function AskAiFab({ agent, storageKey, title, ariaLabel, placeholder, suggestions, invalidateOnClose }: AskAiFabProps) {
  const [open, setOpen] = useState(false);
  const chat = useAgentChat({ agent, storageKey });
  const queryClient = useQueryClient();

  const close = () => {
    setOpen(false);
    for (const queryKey of invalidateOnClose ?? []) queryClient.invalidateQueries({ queryKey });
  };

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-[52px] h-[52px] rounded-full bg-ai text-white flex items-center justify-center shadow-[0_8px_20px_rgba(124,92,252,0.35)] hover:opacity-90 cursor-pointer"
      >
        <SparkleIcon width={24} height={24} />
      </button>
      <Drawer open={open} onClose={close} ariaLabel={title}>
        <ChatWorkspace
          agent={agent}
          chat={chat}
          title={title}
          placeholder={placeholder}
          suggestions={suggestions}
          onClose={close}
        />
      </Drawer>
    </>
  );
}
