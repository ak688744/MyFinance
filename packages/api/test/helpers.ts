import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildServer, type BuildServerOpts } from '../src/server';
import type { FastifyInstance } from 'fastify';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Read a fixture file as a Node Buffer (for multipart payload building). */
export function fixtureBuffer(name: string): Buffer {
  return readFileSync(join(fixturesDir, name));
}

/** No-network AMFI stub for the holdings import. */
export const stubAmfiMatch = async () => ({ matched: 0, total: 0, matches: [] });

/**
 * Build a server on an in-memory DB with the AMFI network call stubbed.
 * Caller must `await app.close()` (closes sqlite).
 */
export async function buildTestServer(
  opts: Partial<BuildServerOpts> = {},
): Promise<FastifyInstance> {
  return buildServer({
    dbPath: ':memory:',
    amfiMatch: stubAmfiMatch,
    ...opts,
  });
}

/**
 * Build a multipart/form-data body + headers for app.inject from a file buffer
 * and string fields. Uses a fixed boundary.
 */
export function multipartPayload(
  fileField: string,
  filename: string,
  fileBuf: Buffer,
  fields: Record<string, string> = {},
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----myfinanceTestBoundary1234567890';
  const CRLF = '\r\n';
  const segments: Buffer[] = [];

  for (const [k, v] of Object.entries(fields)) {
    segments.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="${k}"${CRLF}${CRLF}` +
          `${v}${CRLF}`,
      ),
    );
  }

  segments.push(
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${fileField}"; filename="${filename}"${CRLF}` +
        `Content-Type: application/vnd.ms-excel${CRLF}${CRLF}`,
    ),
  );
  segments.push(fileBuf);
  segments.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

  const payload = Buffer.concat(segments);
  return {
    payload,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
