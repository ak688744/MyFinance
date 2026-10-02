import { useEffect, type ReactNode } from 'react';

/** Right slide-over (420px) with a click-to-close scrim; Escape also closes. */
export function Drawer({ open, onClose, children, ariaLabel }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div data-testid="drawer-scrim" className="fixed inset-0 bg-black/30 z-[60]" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={ariaLabel}
        className="fixed inset-y-0 right-0 w-[420px] max-w-full bg-white shadow-[-8px_0_24px_rgba(15,23,42,0.12)] z-[70] flex flex-col"
      >
        {children}
      </aside>
    </>
  );
}
