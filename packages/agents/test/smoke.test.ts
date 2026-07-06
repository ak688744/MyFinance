import { describe, it, expect } from 'vitest';
import { AGENTS_VERSION } from '../src/index';

describe('agents package', () => {
  it('is importable', () => { expect(AGENTS_VERSION).toBe('0.0.0'); });
});
