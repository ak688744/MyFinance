// PDF → text extraction, isolated so the pdfjs dependency stays in one place.
// The password is a function argument ONLY — it is never persisted or logged.
import { getDocument, PasswordResponses } from 'pdfjs-dist/legacy/build/pdf.mjs';

export class PdfPasswordRequiredError extends Error {
  constructor(msg = 'PDF is password protected') { super(msg); this.name = 'PdfPasswordRequiredError'; }
}
export class PdfPasswordIncorrectError extends Error {
  constructor(msg = 'Incorrect PDF password') { super(msg); this.name = 'PdfPasswordIncorrectError'; }
}

export async function extractPdfText(buffer: ArrayBuffer, password?: string): Promise<string> {
  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({
    data,
    password,
    isEvalSupported: false,
  } as any);

  (loadingTask as any).onPassword = (_updatePassword: (pw: string) => void, reason: number) => {
    if (reason === PasswordResponses.NEED_PASSWORD) {
      loadingTask.destroy();
      throw new PdfPasswordRequiredError();
    }
    if (reason === PasswordResponses.INCORRECT_PASSWORD) {
      loadingTask.destroy();
      throw new PdfPasswordIncorrectError();
    }
  };

  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (e) {
    if (e instanceof PdfPasswordRequiredError || e instanceof PdfPasswordIncorrectError) throw e;
    const name = (e as any)?.name;
    if (name === 'PasswordException') {
      const code = (e as any)?.code;
      if (code === PasswordResponses.INCORRECT_PASSWORD) throw new PdfPasswordIncorrectError();
      throw new PdfPasswordRequiredError();
    }
    throw new Error('pdf_extract_failed');
  }

  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((it: any) => (typeof it.str === 'string' ? it.str : '')).join(' '));
  }
  await doc.destroy();
  return parts.join('\n');
}
