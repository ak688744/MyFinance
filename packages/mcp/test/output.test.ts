import { describe, it, expect } from 'vitest';
import { ok, errorResult } from '../src/shared/output';

describe('output helpers', () => {
  it('ok() puts compact JSON in a text block and mirrors it to structuredContent', () => {
    const r = ok({ netWorthInr: 1234.5, byAssetClass: [] });
    expect(r.isError).toBeUndefined();
    expect(r.content).toEqual([{ type: 'text', text: '{"netWorthInr":1234.5,"byAssetClass":[]}' }]);
    expect(r.structuredContent).toEqual({ netWorthInr: 1234.5, byAssetClass: [] });
  });

  it('errorResult() sets isError and a plain-text message, no structuredContent', () => {
    const r = errorResult('Liability 99 not found.');
    expect(r.isError).toBe(true);
    expect(r.content).toEqual([{ type: 'text', text: 'Liability 99 not found.' }]);
    expect(r.structuredContent).toBeUndefined();
  });
});
