import { describe, it, expect } from 'vitest';
import { parseSseChunk } from '../src/lib/apiStream';

describe('parseSseChunk', () => {
  it('parses complete data frames and returns leftover', () => {
    const raw =
      'data: {"type":"start","threadId":"t1"}\n\n' +
      'data: {"type":"token","text":"Hi"}\n\n' +
      'data: {"type":"token","text":" there"}\n\n' +
      'data: {"type":"do';
    const { events, rest } = parseSseChunk(raw);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'start', threadId: 't1' });
    expect(events[1]).toEqual({ type: 'token', text: 'Hi' });
    expect(events[2]).toEqual({ type: 'token', text: ' there' });
    expect(rest).toBe('data: {"type":"do');
  });

  it('returns no events for an empty buffer', () => {
    expect(parseSseChunk('')).toEqual({ events: [], rest: '' });
  });

  it('handles a done event with usage', () => {
    const raw = 'data: {"type":"done","threadId":"t9","usage":{"inputTokens":5,"outputTokens":2}}\n\n';
    const { events } = parseSseChunk(raw);
    expect(events[0]).toMatchObject({ type: 'done', threadId: 't9' });
  });
});
