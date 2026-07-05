import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from '../src/config';

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe('loadConfig llm', () => {
  it('builds categorization config when GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.AI_CATEGORIZATION_MODEL = 'gemini-1.5-flash';
    const cfg = loadConfig();
    expect(cfg.llm.categorization).toEqual({
      dialect: 'gemini', model: 'gemini-1.5-flash', apiKey: 'k',
    });
  });
  it('defaults to a current model (gemini-2.5-flash) when AI_CATEGORIZATION_MODEL is unset', () => {
    process.env.GEMINI_API_KEY = 'k';
    delete process.env.AI_CATEGORIZATION_MODEL;
    const cfg = loadConfig();
    expect(cfg.llm.categorization?.model).toBe('gemini-2.5-flash');
  });
  it('categorization is null when no key present', () => {
    delete process.env.GEMINI_API_KEY;
    const cfg = loadConfig();
    expect(cfg.llm.categorization).toBeNull();
  });
});
