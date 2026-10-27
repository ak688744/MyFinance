import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', 'fixtures', 'cas');
const files = readdirSync(DIR).filter((f) => !f.startsWith('.'));

describe('CAS fixtures are synthetic and PII-free', () => {
  it('finds fixture files', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  for (const f of files) {
    it(`${f} has no PAN, email, 10-digit run or local path`, () => {
      const text = readFileSync(join(DIR, f), 'utf8');
      expect(text).not.toMatch(/[A-Z]{5}[0-9]{4}[A-Z]/);
      expect(text).not.toContain('@');
      expect(text).not.toMatch(/\d{10}/);
      expect(text).not.toContain('Downloads');
    });
  }
});
