// Keyed hash for the CAS holder PAN. The raw PAN is never stored or logged; only
// this HMAC is compared across imports. Key = MYFINANCE_SECRET_KEY (64-hex).
import { createHmac } from 'node:crypto';

export function makePanHasher(): ((pan: string) => string) | null {
  const hex = process.env.MYFINANCE_SECRET_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  // Domain-separated sub-key so the master key is never used directly for PAN hashing.
  const key = createHmac('sha256', Buffer.from(hex, 'hex')).update('myfinance:cas-pan:v1').digest();
  return (pan: string) => createHmac('sha256', key).update(pan).digest('hex');
}
