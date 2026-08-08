import { describe, it, expect } from 'vitest';
import { extractPdfText, PdfPasswordRequiredError, PdfPasswordIncorrectError } from '../src/lib/pdfText';
import { makeSimplePdf, makeEncryptedPdf } from './fixtures/makePdf';

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
