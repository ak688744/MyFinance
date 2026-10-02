// Pure helpers that turn stored Mastra messages into the chat-history shape the
// web UI renders. No Mastra runtime import: input is structurally typed.

import { ASK_USER_TOOL_NAME } from './askUserTool';
import { toFriendlyToolLabel, toQuestionEvent } from './streamEvents';

export type HistoryMessage = {
  role: 'user' | 'assistant';
  text: string;
  steps?: string[];
  question?: { question: string; options: { label: string }[] };
};

export type ThreadSummary = {
  id: string;
  title: string;
  snippet: string;
  createdAt: string;
  updatedAt: string;
};

type DbPart = {
  type?: string;
  text?: string;
  toolInvocation?: { toolName?: string; args?: unknown };
};
export type DbMessageLike = {
  role?: string;
  content?: { parts?: DbPart[]; content?: string } | string;
};

function extract(m: DbMessageLike): { text: string; steps: string[]; question?: HistoryMessage['question'] } {
  const content = m.content;
  const parts = content && typeof content === 'object' && Array.isArray(content.parts) ? content.parts : [];
  let text = '';
  const steps: string[] = [];
  let question: HistoryMessage['question'];
  for (const p of parts) {
    if (p.type === 'text' && typeof p.text === 'string') {
      text += p.text;
    } else if (p.type === 'tool-invocation' && p.toolInvocation) {
      const name = p.toolInvocation.toolName ?? '';
      if (name === ASK_USER_TOOL_NAME) {
        const q = toQuestionEvent(p.toolInvocation.args);
        if (q) question = { question: q.question, options: q.options };
      } else {
        steps.push(toFriendlyToolLabel(name));
      }
    }
  }
  if (!text && parts.length === 0 && content && typeof content === 'object' && typeof content.content === 'string') {
    text = content.content;
  }
  if (!text && typeof content === 'string') text = content;
  return { text, steps, question };
}

export function toHistoryMessages(dbMessages: DbMessageLike[]): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  for (const m of dbMessages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const { text, steps, question } = extract(m);
    if (m.role === 'user') {
      if (!text.trim()) continue;
      out.push({ role: 'user', text });
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && prev.role === 'assistant') {
      prev.text += text;
      if (steps.length) prev.steps = [...(prev.steps ?? []), ...steps];
      if (question) prev.question = question;
    } else {
      const msg: HistoryMessage = { role: 'assistant', text };
      if (steps.length) msg.steps = steps;
      if (question) msg.question = question;
      out.push(msg);
    }
  }
  for (const m of out) if (m.role === 'assistant') m.text = m.text.trim();
  return out;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
}

function stripMarkdown(s: string): string {
  return s
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*\|?[\s:|-]*-{3,}[\s:|-]*\|?\s*$/gm, ' ')
    .replace(/[#*`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function iso(d: unknown): string {
  if (d instanceof Date) return d.toISOString();
  return typeof d === 'string' ? d : new Date(d as number).toISOString();
}

// Insight "Discuss" seeds all open with the same preamble; title them by the insight instead.
const INSIGHT_SEED_PREFIX = /^I'm reviewing flagged transactions from my Expenses page:\s*/;

function titleFromUserText(text: string): string {
  const firstLine = text.trim().split('\n')[0] ?? '';
  if (INSIGHT_SEED_PREFIX.test(firstLine)) {
    return `Review: ${firstLine.replace(INSIGHT_SEED_PREFIX, '')}`.replace(/\s+/g, ' ').trim();
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function summarizeThread(
  thread: { id: string; createdAt: unknown; updatedAt: unknown },
  messages: HistoryMessage[],
): ThreadSummary {
  const firstUser = messages.find((m) => m.role === 'user');
  const titleSrc = firstUser ? titleFromUserText(firstUser.text) : '';
  const title = titleSrc ? truncate(titleSrc, 60) : 'Untitled chat';
  const last = messages[messages.length - 1];
  let snippetSrc = '';
  if (last) snippetSrc = last.text.trim() || last.question?.question || '';
  const snippet = truncate(stripMarkdown(snippetSrc), 100);
  return { id: thread.id, title, snippet, createdAt: iso(thread.createdAt), updatedAt: iso(thread.updatedAt) };
}
