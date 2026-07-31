// Pure mapping from Mastra `fullStream` chunks to the harness's SSE-facing events.
// Kept pure + framework-free so it is unit-testable against the real chunk shapes
// captured from a live Bedrock run (see streamEvents.test.ts).

export type HarnessEvent =
  | { type: 'text'; text: string }
  | { type: 'step'; label: string };

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

/** Map one Mastra fullStream chunk to a HarnessEvent, or null to ignore it. */
export function mapChunk(chunk: unknown): HarnessEvent | null {
  const c = chunk as { type?: string; payload?: { text?: string; toolName?: string } };
  if (!c || typeof c.type !== 'string') return null;
  if (c.type === 'text-delta') {
    const text = c.payload?.text ?? '';
    return text ? { type: 'text', text } : null;
  }
  if (c.type === 'tool-call') {
    return { type: 'step', label: toFriendlyToolLabel(c.payload?.toolName ?? '') };
  }
  return null;
}
