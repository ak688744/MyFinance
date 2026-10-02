import { useState } from 'react';
import type { Computation } from './useAgentChat';

function Block({ label, text, tone }: { label: string; text: string; tone?: 'error' }) {
  return (
    <div className="mt-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <pre className={`mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-mono text-xs ${tone === 'error' ? 'text-red-700' : 'text-gray-800'}`}>{text}</pre>
    </div>
  );
}

/** Collapsed provenance for run_python calls (spec section 8): code, output, result. Rendered as text only. */
export function ComputationTrail({ computations }: { computations: Computation[] }) {
  const [open, setOpen] = useState(false);
  if (computations.length === 0) return null;
  const label = `How this was computed${computations.length > 1 ? ` (${computations.length})` : ''}`;
  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-violet-700 hover:underline">
        {open ? '▾' : '▸'} {label}
      </button>
      {open && computations.map((c, i) => (
        <div key={i} className="mt-2 rounded border border-gray-200 p-2">
          <Block label="Python" text={c.code} />
          {c.stdout.trim() !== '' && <Block label="Output" text={c.stdout.trimEnd()} />}
          {c.result !== null && c.result !== undefined && (
            <Block label="Result" text={typeof c.result === 'string' ? c.result : JSON.stringify(c.result, null, 2)} />
          )}
          {c.error && <Block label="Error" text={c.error} tone="error" />}
          <div className="mt-1 text-[11px] text-gray-500">ran in {(c.durationMs / 1000).toFixed(1)} s</div>
        </div>
      ))}
    </div>
  );
}
