// packages/api/src/lib/multipart.ts
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';

export type UploadedFile = {
  buffer: ArrayBuffer;
  filename: string;
};

export type ParsedMultipart = {
  file: UploadedFile | null;
  fields: Record<string, string>;
};

/**
 * Read a multipart/form-data request: the first file part (any field name) is
 * returned as an ArrayBuffer + filename; all value parts are collected as
 * string fields. Throws statusCode-400 if the request is not multipart.
 */
export async function readMultipart(req: FastifyRequest): Promise<ParsedMultipart> {
  if (!req.isMultipart()) {
    const err = new Error('Expected multipart/form-data request.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const fields: Record<string, string> = {};
  let file: UploadedFile | null = null;

  const parts = req.parts();
  for await (const part of parts) {
    if (part.type === 'file') {
      // First file wins; still drain remaining parts to collect all fields.
      if (file === null) {
        const nodeBuffer = await part.toBuffer();
        // Copy into a standalone ArrayBuffer (the parsers call XLSX.read with
        // type:'array'); slice avoids handing over a pooled Buffer's backing store.
        const ab = nodeBuffer.buffer.slice(
          nodeBuffer.byteOffset,
          nodeBuffer.byteOffset + nodeBuffer.byteLength,
        ) as ArrayBuffer;
        file = { buffer: ab, filename: part.filename };
      } else {
        // Drain the ignored file part so the stream is consumed.
        await part.toBuffer();
      }
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }

  return { file, fields };
}
