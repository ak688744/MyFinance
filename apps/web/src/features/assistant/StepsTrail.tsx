import { useState } from 'react';

/**
 * Collapsible trail of the background steps the agent took (tool calls),
 * so the final answer stays clean but the "how it got there" is one click away.
 * While streaming with no answer text yet, shows the latest step as a live status.
 */
export function StepsTrail({ steps, streaming, hasText }: { steps: string[]; streaming: boolean; hasText: boolean }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;

  // Live status: still working and no answer has started streaming yet.
  if (streaming && !hasText) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-ink-muted mb-1">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-ai animate-pulse" />
        <span className="animate-pulse">{steps[steps.length - 1]}…</span>
      </div>
    );
  }

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-ink transition-colors cursor-pointer"
      >
        <span className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>▸</span>
        {open ? 'Hide steps' : `${steps.length} step${steps.length > 1 ? 's' : ''}`}
      </button>
      {open && (
        <ol className="mt-1 pl-4 space-y-0.5 border-l border-border">
          {steps.map((s, i) => (
            <li key={i} className="text-[11px] text-ink-muted pl-2">{s}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
