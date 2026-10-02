import { describe, it, expect } from 'vitest';
import { toHistoryMessages, summarizeThread } from '../src/threadHistory';

const tx = (role: string, parts: any[]) => ({ role, content: { format: 2, parts } });
const text = (t: string) => ({ type: 'text', text: t });
const tool = (toolName: string, args: any = {}) => ({ type: 'tool-invocation', toolInvocation: { state: 'result', toolName, args } });

describe('toHistoryMessages', () => {
  it('keeps user/assistant only, merges consecutive assistant messages, collects steps', () => {
    const out = toHistoryMessages([
      tx('user', [text('how much did I spend?')]),
      tx('system', [text('ignore')]),
      tx('assistant', [tool('finance_get_expense_summary')]),
      tx('assistant', [text('  You spent '), tool('finance_list_transactions')]),
      tx('assistant', [text('50k.  ')]),
    ]);
    expect(out).toEqual([
      { role: 'user', text: 'how much did I spend?' },
      { role: 'assistant', text: 'You spent 50k.', steps: ['Analysing expenses', 'Reading transactions'] },
    ]);
  });

  it('maps ask_user to a question, not a step', () => {
    const out = toHistoryMessages([
      tx('assistant', [tool('ask_user', { question: 'Which?', options: [{ label: 'A' }, { bad: 1 }] })]),
    ]);
    expect(out).toEqual([{ role: 'assistant', text: '', question: { question: 'Which?', options: [{ label: 'A' }] } }]);
  });

  it('falls back to content.content and drops empty user messages', () => {
    const out = toHistoryMessages([
      { role: 'user', content: { format: 2, parts: [], content: 'hello' } },
      tx('user', [text('   ')]),
    ]);
    expect(out).toEqual([{ role: 'user', text: 'hello' }]);
  });
});

describe('summarizeThread', () => {
  const th = { id: 't', createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: '2026-01-02T00:00:00.000Z' };
  it('truncates title to 60 and strips markdown in snippet', () => {
    const long = 'x'.repeat(80);
    const s = summarizeThread(th, [
      { role: 'user', text: `  ${long}  ` },
      { role: 'assistant', text: '## Head\n> quote **bold** `code`\n| a | b |\n|---|---|\n| 1 | 2 |' },
    ]);
    expect(s.title).toBe('x'.repeat(60) + '…');
    expect(s.snippet).toBe('Head quote bold code a b 1 2');
    expect(s.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(s.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });
  it('truncates snippet to 100, uses question for empty assistant text, fallback title', () => {
    const s = summarizeThread(th, [{ role: 'assistant', text: '', question: { question: 'Q?', options: [] } }]);
    expect(s.title).toBe('Untitled chat');
    expect(s.snippet).toBe('Q?');
    const s2 = summarizeThread(th, [{ role: 'assistant', text: 'y'.repeat(150) }]);
    expect(s2.snippet).toBe('y'.repeat(100) + '…');
  });
  it('titles insight-seed threads by the insight, not the shared preamble', () => {
    const s = summarizeThread(th, [{
      role: 'user',
      text: "I'm reviewing flagged transactions from my Expenses page: 2 Amazon charges need a cadence\nTransactions: #1 \"AMZ\" ₹500.",
    }]);
    expect(s.title).toBe('Review: 2 Amazon charges need a cadence');
  });
});
