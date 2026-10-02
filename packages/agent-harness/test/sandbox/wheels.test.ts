import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { requiredWheelFiles, SANDBOX_PACKAGES } from '../../src/sandbox/wheels';
import { resolveSandboxPaths } from '../../src/sandbox/paths';

describe('requiredWheelFiles', () => {
  const lock = {
    packages: {
      pandas: { file_name: 'pandas-3.whl', depends: ['numpy', 'python-dateutil'] },
      numpy: { file_name: 'numpy-2.whl', depends: [] },
      'python-dateutil': { file_name: 'dateutil.whl', depends: ['six'] },
      six: { file_name: 'six.whl', depends: [] },
      scipy: { file_name: 'scipy.whl', depends: ['numpy'] },
    },
  };
  it('walks dependencies transitively, once each, sorted', () => {
    expect(requiredWheelFiles(lock, ['pandas'])).toEqual(['dateutil.whl', 'numpy-2.whl', 'pandas-3.whl', 'six.whl']);
  });
  it('throws on a package missing from the lock', () => {
    expect(() => requiredWheelFiles(lock, ['polars'])).toThrow(/polars/);
  });
});

describe('resolveSandboxPaths', () => {
  it('returns real (symlink-free) paths that exist', () => {
    const p = resolveSandboxPaths();
    for (const f of [p.pyodideDir, p.lockFile, p.childEntry, p.prefetchEntry, p.wheelCache]) {
      expect(existsSync(f)).toBe(true);
      expect(realpathSync(f)).toBe(f);
    }
    expect(p.pyodideEntryUrl).toMatch(/^file:\/\/.*\/pyodide\.mjs$/);
  });
  it('the real lock file lists numpy and pandas wheels', () => {
    const lock = JSON.parse(readFileSync(resolveSandboxPaths().lockFile, 'utf8'));
    const files = requiredWheelFiles(lock, [...SANDBOX_PACKAGES]);
    expect(files.some((f) => f.startsWith('numpy-'))).toBe(true);
    expect(files.some((f) => f.startsWith('pandas-'))).toBe(true);
  });
});
