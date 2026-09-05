// Minimal uncompressed single-page PDF containing the literal text "SWIGGY 500".
export function makeSimplePdf(text = 'SWIGGY 500'): ArrayBuffer {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs: string[] = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(pdf).buffer as ArrayBuffer;
}

// ── Encrypted PDF (Standard security handler, revision 2, 40-bit RC4) ─────────
// Produces a REAL password-protected PDF so extractPdfText's password branches
// are genuinely exercised — no external tooling or committed binary needed, and
// no OpenSSL RC4 (disabled in Node 22's default provider), so it works anywhere.
// Follows PDF 1.7 spec Algorithms 2 (key), 3 (O), 4 (U rev-2), 1 (per-object key).
// Verified end-to-end against pdfjs: no-pw → NEED_PASSWORD, wrong-pw →
// INCORRECT_PASSWORD, correct-pw → text extracts.

import { createHash } from 'node:crypto';

const PAD = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function padPassword(pw: string): Buffer {
  return Buffer.concat([Buffer.from(pw, 'latin1'), PAD]).subarray(0, 32);
}

// Pure-JS RC4 (Node's OpenSSL disables rc4 by default under Node 22).
function rc4(key: Buffer, data: Buffer): Buffer {
  const s: number[] = [];
  for (let i = 0; i < 256; i += 1) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  let a = 0;
  let b = 0;
  for (let k = 0; k < data.length; k += 1) {
    a = (a + 1) & 255;
    b = (b + s[a]) & 255;
    [s[a], s[b]] = [s[b], s[a]];
    out[k] = data[k] ^ s[(s[a] + s[b]) & 255];
  }
  return out;
}

/**
 * Build a password-protected version of the simple PDF. Both user and owner
 * password are `password` by default; 40-bit RC4, fixed file ID (deterministic).
 */
export function makeEncryptedPdf(text = 'SWIGGY 500', password = 'password'): ArrayBuffer {
  const idHex = '0123456789abcdef0123456789abcdef';
  const id = Buffer.from(idHex, 'hex');
  const P = -44; // permissions
  const padded = padPassword(password);

  // Algorithm 3: O entry (owner == user password here).
  const oKey = createHash('md5').update(padded).digest().subarray(0, 5);
  const O = rc4(oKey, padded);

  // Algorithm 2: encryption key.
  const pBuf = Buffer.alloc(4);
  pBuf.writeInt32LE(P, 0);
  const encKey = createHash('md5')
    .update(Buffer.concat([padded, O, pBuf, id]))
    .digest()
    .subarray(0, 5);

  // Algorithm 4 (rev 2): U = RC4(encKey, PAD).
  const U = rc4(encKey, PAD);

  // Algorithm 1: per-object key for the content stream (obj 4, gen 0).
  const objKey = (num: number): Buffer => {
    const ext = Buffer.concat([
      encKey,
      Buffer.from([num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, 0, 0]),
    ]);
    return createHash('md5').update(ext).digest().subarray(0, Math.min(encKey.length + 5, 16));
  };

  const contentEnc = rc4(objKey(4), Buffer.from(`BT /F1 12 Tf 72 720 Td (${text}) Tj ET`, 'latin1'));

  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (b: Buffer) => { parts.push(b); pos += b.length; };
  const pushObj = (num: number, body: Buffer) => {
    offsets[num] = pos;
    push(Buffer.concat([Buffer.from(`${num} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]));
  };

  push(Buffer.from('%PDF-1.4\n', 'latin1'));
  pushObj(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'));
  pushObj(2, Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1'));
  pushObj(3, Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', 'latin1'));
  pushObj(4, Buffer.concat([
    Buffer.from(`<< /Length ${contentEnc.length} >>\nstream\n`, 'latin1'),
    contentEnc,
    Buffer.from('\nendstream', 'latin1'),
  ]));
  pushObj(5, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'latin1'));
  pushObj(6, Buffer.from(`<< /Filter /Standard /V 1 /R 2 /O <${O.toString('hex')}> /U <${U.toString('hex')}> /P ${P} >>`, 'latin1'));

  const xrefPos = pos;
  const count = 7; // objs 0..6
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < count; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${count} /Root 1 0 R /Encrypt 6 0 R /ID [<${idHex}> <${idHex}>] >>\nstartxref\n${xrefPos}\n%%EOF`;
  push(Buffer.from(xref, 'latin1'));

  const out = Buffer.concat(parts);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
