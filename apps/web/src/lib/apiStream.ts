const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

export type AgentEvent =
  | { type: 'start'; threadId: string }
  | { type: 'token'; text: string }
  | { type: 'step'; label: string }
  | { type: 'done'; threadId: string; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; message: string };

export function parseSseChunk(buffer: string): { events: AgentEvent[]; rest: string } {
  const events: AgentEvent[] = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const frame = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    const line = frame.startsWith('data: ') ? frame.slice(6) : frame.replace(/^data:\s?/, '');
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as AgentEvent);
    } catch {
      // ignore malformed frame
    }
  }
  return { events, rest };
}

export async function* streamAgentChat(body: {
  threadId?: string;
  message: string;
}): AsyncGenerator<AgentEvent> {
  const res = await fetch(`${API_BASE}/agent/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    yield { type: 'error', message: `Request failed (${res.status})` };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseChunk(buffer);
    buffer = rest;
    for (const ev of events) yield ev;
  }
  const { events } = parseSseChunk(buffer + '\n\n');
  for (const ev of events) yield ev;
}
