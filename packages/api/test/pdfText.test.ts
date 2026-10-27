import { describe, it, expect } from 'vitest';
import { extractPdfText, extractPdfLines, PdfPasswordRequiredError, PdfPasswordIncorrectError } from '../src/lib/pdfText';
import { makeSimplePdf, makeEncryptedPdf, makeLinesPdf, makeItemsPdf } from './fixtures/makePdf';

describe('extractPdfText', () => {
  it('extracts text from an unencrypted PDF', async () => {
    const text = await extractPdfText(makeSimplePdf('SWIGGY 500'));
    expect(text).toContain('SWIGGY');
  });

  it('throws PdfPasswordRequiredError on an encrypted PDF with no password', async () => {
    const pdf = makeEncryptedPdf('SWIGGY 500', 'password');
    await expect(extractPdfText(pdf)).rejects.toBeInstanceOf(PdfPasswordRequiredError);
  });

  it('throws PdfPasswordIncorrectError on a wrong password', async () => {
    const pdf = makeEncryptedPdf('SWIGGY 500', 'password');
    await expect(extractPdfText(pdf, 'wrongpw')).rejects.toBeInstanceOf(PdfPasswordIncorrectError);
  });

  it('extracts text from an encrypted PDF with the correct password', async () => {
    const pdf = makeEncryptedPdf('SWIGGY 500', 'password');
    const text = await extractPdfText(pdf, 'password');
    expect(text).toContain('SWIGGY');
  });

  it('throws pdf_extract_failed on a non-PDF / corrupt buffer', async () => {
    const junk = new TextEncoder().encode('this is not a pdf').buffer as ArrayBuffer;
    await expect(extractPdfText(junk)).rejects.toThrow('pdf_extract_failed');
  });
});

// Reference algorithm (the scratchpad extract.mjs the parser was built against), run in-test.
async function referenceExtract(buf: ArrayBuffer, password?: string): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buf.slice(0)), password, useSystemFonts: true } as any).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p += 1) {
    const tc = await (await doc.getPage(p)).getTextContent();
    let line = '';
    let lastY: number | null = null;
    for (const it of tc.items as any[]) {
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) { out += `${line.trimEnd()}\n`; line = ''; }
      line += it.str + (it.hasEOL ? '' : ' ');
      lastY = y;
    }
    out += `${line}\n=====PAGE ${p}=====\n`;
  }
  return out;
}

describe('extractPdfLines', () => {
  const lines = ['Consolidated Account Statement', 'Folio No: 1234567 / 1', '05-Jan-2024 4,999.75 10.0000 499.975 (1)', 'Closing Unit Balance: 1,299.935'];

  it('returns one line per Y position in stream order with page markers', async () => {
    const out = (await extractPdfLines(makeLinesPdf(lines))).split('\n').map((l) => l.trimEnd());
    expect(out).toEqual([...lines, '=====PAGE 1=====', '']);
  });

  it('numbers multiple pages', async () => {
    const many = Array.from({ length: 7 }, (_, i) => `line ${i}`);
    const out = (await extractPdfLines(makeLinesPdf(many, { perPage: 3 }))).split('\n').map((l) => l.trimEnd());
    expect(out).toEqual(['line 0', 'line 1', 'line 2', '=====PAGE 1=====', 'line 3', 'line 4', 'line 5', '=====PAGE 2=====', 'line 6', '=====PAGE 3=====', '']);
  });

  it('keeps pdfjs stream order within a line (not X order)', async () => {
    // amounts drawn first, description (positioned LEFT of them) drawn last, same Y.
    const pdf = makeItemsPdf([[
      { text: '05-Jan-2024', x: 20, y: 700 },
      { text: '4,999.75', x: 200, y: 700 },
      { text: '12.5000', x: 260, y: 700 },
      { text: 'Systematic Investment', x: 60, y: 700 },
      { text: 'next line', x: 20, y: 680 },
    ]]);
    const out = await extractPdfLines(pdf);
    expect(out.split('\n')[0].replace(/\s+/g, ' ')).toBe('05-Jan-2024 4,999.75 12.5000 Systematic Investment');
    expect(out).toBe(await referenceExtract(pdf));
  });

  it('does not merge non-consecutive items that share a Y', async () => {
    const pdf = makeItemsPdf([[
      { text: 'NAV on 01-Jan-2024: 10.0', x: 20, y: 700 },
      { text: 'Interleaved line', x: 20, y: 660 },
      { text: 'Closing Unit Balance: 1.000', x: 20, y: 700 },
    ]]);
    const out = (await extractPdfLines(pdf)).split('\n');
    expect(out.slice(0, 3)).toEqual(['NAV on 01-Jan-2024: 10.0', 'Interleaved line', 'Closing Unit Balance: 1.000 ']);
    expect(await extractPdfLines(pdf)).toBe(await referenceExtract(pdf));
  });

  it('matches the reference on an encrypted multi-item PDF; errors on bad passwords', async () => {
    const pdf = makeItemsPdf([[{ text: 'b', x: 100, y: 700 }, { text: 'a', x: 10, y: 700 }, { text: 'c', x: 10, y: 600 }]], { password: 'pw1' });
    expect(await extractPdfLines(pdf, 'pw1')).toBe(await referenceExtract(pdf, 'pw1'));
    await expect(extractPdfLines(pdf)).rejects.toBeInstanceOf(PdfPasswordRequiredError);
    await expect(extractPdfLines(pdf, 'nope')).rejects.toBeInstanceOf(PdfPasswordIncorrectError);
  });

  it('throws pdf_extract_failed on junk', async () => {
    await expect(extractPdfLines(new TextEncoder().encode('junk').buffer as ArrayBuffer)).rejects.toThrow('pdf_extract_failed');
  });
});
