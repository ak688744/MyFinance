// Pure mapping from Mastra `fullStream` chunks to the harness's SSE-facing events.
// Kept pure + framework-free so it is unit-testable against the real chunk shapes
// captured from a live Bedrock run (see streamEvents.test.ts).

import { ASK_USER_TOOL_NAME } from './askUserTool';

export type HarnessEvent =
  | { type: 'text'; text: string }
  | { type: 'step'; label: string }
  | { type: 'question'; question: string; options: { label: string }[] };

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
function toQuestionEvent(args: unknown): HarnessEvent | null {
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
