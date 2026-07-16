import { describe, it, expect } from 'vitest';
import { ok, errorResult, preview } from '../src/shared/output';

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

describe('preview', () => {
  it('returns a non-error result with preview:true and impact fields', () => {
    const r = preview('Would delete 3 rules.', { ruleCount: 3 });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toEqual({ preview: true, ruleCount: 3 });
    expect(r.content[0].text).toContain('Would delete 3 rules.');
    expect(r.content[0].text).toContain('confirm: true');
  });

  it('works with no impact object', () => {
    const r = preview('Would do X.');
    expect(r.structuredContent).toEqual({ preview: true });
  });
});
