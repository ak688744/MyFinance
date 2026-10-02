// Pure mapping from Mastra `fullStream` chunks to the harness's SSE-facing events.
// Kept pure + framework-free so it is unit-testable against the real chunk shapes
// captured from a live Bedrock run (see streamEvents.test.ts).

import { ASK_USER_TOOL_NAME } from './askUserTool';
import { RUN_PYTHON_TOOL_NAME, OUTPUT_LIMIT, type RunPythonOutput } from './runPythonTool';

export type HarnessEvent =
  | { type: 'text'; text: string }
  | { type: 'step'; label: string }
  | { type: 'question'; question: string; options: { label: string }[] }
  | { type: 'computation'; code: string; stdout: string; result: unknown; error?: string; durationMs: number };

/** Turn a raw tool name (e.g. "finance_get_networth_overview") into a human label. */
export function toFriendlyToolLabel(toolName: string): string {
  if (!toolName) return 'Working';
  if (toolName === 'updateWorkingMemory') return 'Updating your profile';
  const cleaned = toolName
    .replace(/^finance_/, '')
    .replace(/^get_/, '')
    .replace(/_/g, ' ')
    .trim();
  const verbMap: Record<string, string> = {
    'networth overview': 'Checking net worth',
    'investment portfolio': 'Reviewing investments',
    'investment returns': 'Reviewing investment returns',
    'expense summary': 'Analysing expenses',
    'list transactions': 'Reading transactions',
    'loans overview': 'Checking loans',
    'loan amortization': 'Checking loan schedule',
    'list accounts': 'Listing accounts',
    'search schemes': 'Searching funds',
    'scheme nav': 'Fetching fund NAV',
  };
  if (verbMap[cleaned]) return verbMap[cleaned];
  // Fallback: "Working on <cleaned>" title-cased.
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Extract a clean `{ question, options[] }` from an ask_user tool-call's args. */
export function toQuestionEvent(args: unknown): Extract<HarnessEvent, { type: 'question' }> | null {
  const a = (args ?? {}) as { question?: unknown; options?: unknown };
  const question = typeof a.question === 'string' ? a.question.trim() : '';
  if (!question) return null; // no usable question → ignore the chunk
  const rawOptions = Array.isArray(a.options) ? a.options : [];
  const options = rawOptions
    .filter((o): o is { label: string } =>
      !!o && typeof o === 'object' && typeof (o as { label?: unknown }).label === 'string')
    .map((o) => ({ label: o.label }));
  return { type: 'question', question, options };
}

/** Map one Mastra fullStream chunk to a HarnessEvent, or null to ignore it. */
export function mapChunk(chunk: unknown): HarnessEvent | null {
  const c = chunk as { type?: string; payload?: { text?: string; toolName?: string; args?: unknown } };
  if (!c || typeof c.type !== 'string') return null;
  if (c.type === 'text-delta') {
    const text = c.payload?.text ?? '';
    return text ? { type: 'text', text } : null;
  }
  if (c.type === 'tool-call') {
    const toolName = c.payload?.toolName ?? '';
    if (toolName === ASK_USER_TOOL_NAME) {
      return toQuestionEvent((c.payload as { args?: unknown })?.args);
    }
    return { type: 'step', label: toFriendlyToolLabel(toolName) };
  }
  return null;
}

export const RUN_PYTHON_STEP_LABEL = 'Running a calculation';

const capText = (v: unknown): string => {
  const t = typeof v === 'string' ? v : '';
  return t.length > OUTPUT_LIMIT ? `${t.slice(0, OUTPUT_LIMIT)}...[truncated]` : t;
};
const capResult = (r: unknown): unknown => {
  try {
    const n = JSON.stringify(r)?.length ?? 0;
    return n > OUTPUT_LIMIT ? `[result truncated: ${n} chars]` : r;
  } catch {
    return '[result not serializable]';
  }
};
const errText = (e: unknown): string => {
  try {
    const m = e instanceof Error ? e.message : typeof e === 'string' ? e : (e as { message?: unknown } | null)?.message ?? String(e);
    return capText(String(m));
  } catch {
    return 'Tool error';
  }
};

/**
 * Stateful wrapper over mapChunk: remembers each run_python call's code so the
 * matching tool-result/tool-error can be emitted as a provenance 'computation' event.
 */
export function createEventMapper(): (chunk: unknown) => HarnessEvent | null {
  const codeByCall = new Map<string, string>();
  return (chunk: unknown) => {
    try {
      const c = chunk as { type?: string; payload?: { toolCallId?: string; toolName?: string; args?: unknown; result?: unknown; error?: unknown } } | null;
      if (c?.payload?.toolName === RUN_PYTHON_TOOL_NAME) {
        const id = typeof c.payload.toolCallId === 'string' && c.payload.toolCallId ? c.payload.toolCallId : null;
        const take = () => {
          const code = id ? codeByCall.get(id) ?? '' : '';
          if (id) codeByCall.delete(id);
          return capText(code);
        };
        if (c.type === 'tool-call') {
          const code = (c.payload.args as { code?: unknown } | undefined)?.code;
          if (id) codeByCall.set(id, typeof code === 'string' ? code : '');
          return { type: 'step', label: RUN_PYTHON_STEP_LABEL };
        }
        if (c.type === 'tool-result') {
          const r = (c.payload.result ?? {}) as Partial<RunPythonOutput>;
          return {
            type: 'computation',
            code: take(),
            stdout: capText(r.stdout),
            result: capResult(r.result ?? null),
            ...(typeof r.error === 'string' ? { error: capText(r.error) } : {}),
            durationMs: typeof r.durationMs === 'number' ? r.durationMs : 0,
          };
        }
        if (c.type === 'tool-error') {
          return { type: 'computation', code: take(), stdout: '', result: null, error: errText(c.payload.error), durationMs: 0 };
        }
      }
      return mapChunk(chunk);
    } catch {
      return null;
    }
  };
}
