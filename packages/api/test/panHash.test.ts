import { describe, it, expect, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { makePanHasher } from '../src/lib/panHash';

const KEY = 'ab'.repeat(32);
const prev = process.env.MYFINANCE_SECRET_KEY;
afterEach(() => { if (prev === undefined) delete process.env.MYFINANCE_SECRET_KEY; else process.env.MYFINANCE_SECRET_KEY = prev; });

describe('makePanHasher', () => {
  it('is null without a valid key', () => {
    delete process.env.MYFINANCE_SECRET_KEY;
    expect(makePanHasher()).toBeNull();
    process.env.MYFINANCE_SECRET_KEY = 'short';
    expect(makePanHasher()).toBeNull();
  });

  it('uses a domain-separated HMAC sub-key', () => {
    process.env.MYFINANCE_SECRET_KEY = KEY;
    const sub = createHmac('sha256', Buffer.from(KEY, 'hex')).update('myfinance:cas-pan:v1').digest();
    const expected = createHmac('sha256', sub).update('ABCDE1234F').digest('hex');
    expect(makePanHasher()!('ABCDE1234F')).toBe(expected);
  });
});
