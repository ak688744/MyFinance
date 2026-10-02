import { describe, it, expect } from 'vitest';
import { mapChunk, toFriendlyToolLabel, createEventMapper, RUN_PYTHON_STEP_LABEL, type HarnessEvent } from '../src/streamEvents';
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

describe('createEventMapper', () => {
  it('turns a run_python call + result into a step then a computation carrying the code', () => {
    const map = createEventMapper();
    expect(map({ type: 'tool-call', payload: { toolCallId: 'c1', toolName: 'run_python', args: { code: 'print(1)', datasets: [] } } }))
      .toEqual({ type: 'step', label: RUN_PYTHON_STEP_LABEL });
    expect(map({ type: 'tool-result', payload: { toolCallId: 'c1', toolName: 'run_python', result: { stdout: '1\n', result: 2, durationMs: 5 } } }))
      .toEqual({ type: 'computation', code: 'print(1)', stdout: '1\n', result: 2, durationMs: 5 });
  });
  it('keeps the error field and tolerates a missing call record', () => {
    const map = createEventMapper();
    expect(map({ type: 'tool-result', payload: { toolCallId: 'zz', toolName: 'run_python', result: { stdout: '', result: null, error: 'boom', durationMs: 1 } } }))
      .toEqual({ type: 'computation', code: '', stdout: '', result: null, error: 'boom', durationMs: 1 });
  });
  it('delegates everything else to mapChunk and never throws on malformed chunks', () => {
    const map = createEventMapper();
    expect(map({ type: 'text-delta', payload: { text: 'hi' } })).toEqual({ type: 'text', text: 'hi' });
    expect(map({ type: 'tool-result', payload: { toolCallId: 't', toolName: 'finance_get_fund_performance', result: {} } })).toBeNull();
    expect(map(null)).toBeNull();
    expect(map({ type: 'tool-result', payload: { toolName: 'run_python', result: 'weird' } })).toMatchObject({ type: 'computation', stdout: '' });
  });
});

describe('createEventMapper hardening', () => {
  const call = (id: string, code: string) => ({ type: 'tool-call', payload: { toolCallId: id, toolName: 'run_python', args: { code } } });
  const res = (id: string, result: unknown) => ({ type: 'tool-result', payload: { toolCallId: id, toolName: 'run_python', result } });
  it('caps oversized code, stdout and result', () => {
    const map = createEventMapper();
    map(call('a', 'x'.repeat(30000)));
    const ev = map(res('a', { stdout: 'y'.repeat(30000), result: 'z'.repeat(30000), durationMs: 1 })) as Extract<HarnessEvent, { type: 'computation' }>;
    expect(ev.code.length).toBeLessThan(20500);
    expect(ev.stdout.length).toBeLessThan(20500);
    expect(ev.result).toMatch(/^\[result truncated: \d+ chars\]$/);
  });
  it('survives a BigInt/circular result', () => {
    const map = createEventMapper();
    expect(map(res('b', { stdout: '', result: 10n, durationMs: 1 }))).toMatchObject({ type: 'computation', result: '[result not serializable]' });
  });
  it('maps tool-error to a computation with the stored code', () => {
    const map = createEventMapper();
    map(call('e', 'boom()'));
    expect(map({ type: 'tool-error', payload: { toolCallId: 'e', toolName: 'run_python', error: new Error('bad') } }))
      .toEqual({ type: 'computation', code: 'boom()', stdout: '', result: null, error: 'bad', durationMs: 0 });
  });
  it('a duplicate tool-result has empty code', () => {
    const map = createEventMapper();
    map(call('d', 'print(1)'));
    map(res('d', { stdout: '', result: 1, durationMs: 1 }));
    expect(map(res('d', { stdout: '', result: 1, durationMs: 1 }))).toMatchObject({ code: '' });
  });
  it('does not share state between mappers', () => {
    const m1 = createEventMapper();
    const m2 = createEventMapper();
    m1(call('s', 'print(1)'));
    expect(m2(res('s', { stdout: '', result: 1, durationMs: 1 }))).toMatchObject({ code: '' });
  });
  it('ignores a call without toolCallId (no empty key)', () => {
    const map = createEventMapper();
    map({ type: 'tool-call', payload: { toolName: 'run_python', args: { code: 'a' } } });
    expect(map({ type: 'tool-result', payload: { toolName: 'run_python', result: { stdout: '', result: 1, durationMs: 1 } } })).toMatchObject({ code: '' });
  });
});
