import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '../../src/db/crypto';

const KEY = '0'.repeat(64); // 32 bytes hex

describe('crypto', () => {
  it('round-trips a secret', () => {
    const blob = encryptSecret('sk-test-123', KEY);
    expect(decryptSecret(blob, KEY)).toBe('sk-test-123');
  });
  it('uses a distinct IV each call (ciphertext differs)', () => {
    expect(encryptSecret('same', KEY)).not.toBe(encryptSecret('same', KEY));
  });
  it('throws on tampered ciphertext', () => {
    const blob = encryptSecret('secret', KEY);
    const tampered = Buffer.from(blob, 'base64');
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptSecret(tampered.toString('base64'), KEY)).toThrow();
  });
  it('throws a clear error on a missing/short key', () => {
    expect(() => encryptSecret('x', 'abc')).toThrow(/MYFINANCE_SECRET_KEY/);
  });
});
