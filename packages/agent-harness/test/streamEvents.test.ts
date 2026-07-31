import { describe, it, expect } from 'vitest';
import { mapChunk, toFriendlyToolLabel, type HarnessEvent } from '../src/streamEvents';
import { ASK_USER_TOOL_NAME } from '../src/askUserTool';

// Chunk shapes captured verbatim from a live Bedrock fullStream run.
const CHUNKS = [
  { type: 'start', runId: 'r', from: 'AGENT', payload: {} },
  { type: 'step-start', runId: 'r', from: 'AGENT', payload: {} },
  { type: 'text-start', runId: 'r', from: 'AGENT', payload: { id: 'a' } },
  { type: 'text-delta', runId: 'r', from: 'AGENT', payload: { id: 'a', text: "I'll fetch" } },
  { type: 'text-delta', runId: 'r', from: 'AGENT', payload: { id: 'a', text: ' your net worth.' } },
  { type: 'text-end', runId: 'r', from: 'AGENT', payload: { id: 'a' } },
  { type: 'tool-call-input-streaming-start', runId: 'r', from: 'AGENT', payload: { toolCallId: 't' } },
  { type: 'tool-call', runId: 'r', from: 'AGENT', payload: { toolCallId: 't', toolName: 'finance_get_networth_overview' } },
  { type: 'tool-result', runId: 'r', from: 'AGENT', payload: { toolCallId: 't' } },
  { type: 'text-start', runId: 'r', from: 'AGENT', payload: { id: 'b' } },
  { type: 'text-delta', runId: 'r', from: 'AGENT', payload: { id: 'b', text: 'Your net worth is ₹95.9L.' } },
  { type: 'finish', runId: 'r', from: 'AGENT', payload: {} },
];

describe('mapChunk', () => {
  it('maps text-delta to a text event', () => {
    expect(mapChunk(CHUNKS[3])).toEqual({ type: 'text', text: "I'll fetch" });
  });

  it('maps tool-call to a step event with a friendly label', () => {
    expect(mapChunk(CHUNKS[7])).toEqual({ type: 'step', label: 'Checking net worth' });
  });

  it('ignores control chunks (start, step-start, text-start/end, tool-result, finish)', () => {
    for (const i of [0, 1, 2, 5, 6, 8, 11]) {
      expect(mapChunk(CHUNKS[i])).toBeNull();
    }
  });

  it('ignores empty text-delta', () => {
    expect(mapChunk({ type: 'text-delta', payload: { text: '' } })).toBeNull();
  });

  it('produces the expected event sequence over a whole tool-using turn', () => {
    const events = CHUNKS.map(mapChunk).filter(Boolean) as HarnessEvent[];
    expect(events).toEqual([
      { type: 'text', text: "I'll fetch" },
      { type: 'text', text: ' your net worth.' },
      { type: 'step', label: 'Checking net worth' },
      { type: 'text', text: 'Your net worth is ₹95.9L.' },
    ]);
  });
});

describe('toFriendlyToolLabel', () => {
  it('maps known finance tools to verbs', () => {
    expect(toFriendlyToolLabel('finance_get_expense_summary')).toBe('Analysing expenses');
    expect(toFriendlyToolLabel('finance_list_transactions')).toBe('Reading transactions');
    expect(toFriendlyToolLabel('finance_get_loans_overview')).toBe('Checking loans');
  });
  it('maps working-memory updates', () => {
    expect(toFriendlyToolLabel('updateWorkingMemory')).toBe('Updating your profile');
  });
  it('falls back to a title-cased label for unknown tools', () => {
    expect(toFriendlyToolLabel('finance_get_something_new')).toBe('Something new');
  });
});

describe('mapChunk — ask_user question events', () => {
  it('maps an ask_user tool-call to a question event (from payload.args)', () => {
    const chunk = {
      type: 'tool-call',
      payload: {
        toolCallId: 'q1',
        toolName: ASK_USER_TOOL_NAME,
        args: { question: 'Prepay or invest?', options: [{ label: 'Prepay' }, { label: 'Invest' }] },
      },
    };
    expect(mapChunk(chunk)).toEqual({
      type: 'question',
      question: 'Prepay or invest?',
      options: [{ label: 'Prepay' }, { label: 'Invest' }],
    });
  });

  it('a finance tool-call still maps to a step (not a question)', () => {
    const chunk = { type: 'tool-call', payload: { toolName: 'finance_get_networth_overview', args: {} } };
    expect(mapChunk(chunk)).toEqual({ type: 'step', label: 'Checking net worth' });
  });

  it('ask_user with no options yields a question event with options: []', () => {
    const chunk = { type: 'tool-call', payload: { toolName: ASK_USER_TOOL_NAME, args: { question: 'How much risk?' } } };
    expect(mapChunk(chunk)).toEqual({ type: 'question', question: 'How much risk?', options: [] });
  });

  it('ask_user with no usable question is ignored (null)', () => {
    const chunk = { type: 'tool-call', payload: { toolName: ASK_USER_TOOL_NAME, args: {} } };
    expect(mapChunk(chunk)).toBeNull();
  });

  it('drops malformed option entries, keeping only { label } strings', () => {
    const chunk = {
      type: 'tool-call',
      payload: {
        toolName: ASK_USER_TOOL_NAME,
        args: { question: 'Pick one', options: [{ label: 'A' }, { nope: 1 }, { label: 42 }, 'x'] },
      },
    };
    expect(mapChunk(chunk)).toEqual({ type: 'question', question: 'Pick one', options: [{ label: 'A' }] });
  });
});
