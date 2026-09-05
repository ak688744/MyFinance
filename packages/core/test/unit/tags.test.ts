import { describe, it, expect } from 'vitest';
import { normalizeTags, parseTags, serializeTags, mergeTags, removeTagFrom } from '../../src/domain/tags';

describe('tags helpers', () => {
  it('normalizeTags lowercases, trims, dedupes (last source wins), keeps order', () => {
    expect(normalizeTags([
      { tag: ' Subscription ', source: 'user' },
      { tag: 'recurring', source: 'user' },
      { tag: 'SUBSCRIPTION', source: 'agent' },
      { tag: '  ', source: 'user' },
    ])).toEqual([
      { tag: 'subscription', source: 'agent' },
      { tag: 'recurring', source: 'user' },
    ]);
  });

  it('parseTags handles null, blank, bad json, non-array, invalid entries', () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags('')).toEqual([]);
    expect(parseTags('not json')).toEqual([]);
    expect(parseTags('{"a":1}')).toEqual([]);
    expect(parseTags('[{"tag":"work","source":"user"},{"tag":123}]')).toEqual([
      { tag: 'work', source: 'user' },
    ]);
    expect(parseTags('[{"tag":"x","source":"weird"}]')).toEqual([{ tag: 'x', source: 'user' }]);
  });

  it('serializeTags returns null when empty, json otherwise', () => {
    expect(serializeTags([])).toBeNull();
    expect(serializeTags([{ tag: 'Work', source: 'user' }])).toBe('[{"tag":"work","source":"user"}]');
  });

  it('mergeTags unions with incoming source winning; removeTagFrom drops case-insensitively', () => {
    expect(mergeTags(
      [{ tag: 'work', source: 'user' }],
      [{ tag: 'WORK', source: 'agent' }, { tag: 'subscription', source: 'agent' }],
    )).toEqual([
      { tag: 'work', source: 'agent' },
      { tag: 'subscription', source: 'agent' },
    ]);
    expect(removeTagFrom([{ tag: 'work', source: 'user' }, { tag: 'x', source: 'agent' }], 'WORK ')).toEqual([
      { tag: 'x', source: 'agent' },
    ]);
  });
});
