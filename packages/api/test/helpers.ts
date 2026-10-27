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

/**
 * Seed the same investment data the old Groww sample files produced
 * (2 schemes, 3 PURCHASE txns, 2 holdings rows) straight through repositories,
 * now that the Groww upload endpoints are unlinked. Mirrors the fixture values:
 * Test Flexi Cap Fund (50u@100 + 48u@104, Apr/May 2025), Test Index Fund (60u@100).
 */
export function seedInvestments(
  app: FastifyInstance,
  opts: { accountName: string; investmentApp?: string; transactions?: boolean; holdings?: boolean },
): void {
  const investmentApp = opts.investmentApp ?? 'groww';
  const { schemeRepo, txRepo, holdingsRepo, importHistoryRepo, accountRepo } = app.repos;
  const flexi = schemeRepo.matchOrCreateScheme({ schemeName: 'Test Flexi Cap Fund', amcName: 'Test AMC', category: 'equity', subCategory: 'Flexi Cap' });
  const index = schemeRepo.matchOrCreateScheme({ schemeName: 'Test Index Fund', amcName: 'Test AMC', category: 'equity', subCategory: 'Index' });
  accountRepo.ensureAccount({ domain: 'investment', institution: investmentApp, label: opts.accountName });

  if (opts.transactions !== false) {
    const rows: [number, string, number, number, number, string][] = [
      [flexi, 'Test Flexi Cap Fund', 50, 100, 5000, '2025-04-10'],
      [flexi, 'Test Flexi Cap Fund', 48, 104, 5000, '2025-05-10'],
      [index, 'Test Index Fund', 60, 100, 6000, '2025-04-10'],
    ];
    for (const [schemeId, schemeName, units, nav, amount, transactionDate] of rows) {
      txRepo.insert({
        schemeId, schemeName, accountName: opts.accountName, investmentApp,
        transactionType: 'PURCHASE', units, nav, amount, transactionDate,
      });
    }
  }

  if (opts.holdings) {
    const importHistoryId = importHistoryRepo.createInvestmentImport({
      accountName: opts.accountName, investmentApp, importType: 'holdings',
      startDate: '2026-03-31', endDate: '2026-03-31', recordCount: 2,
    });
    const h: [number, string, string, number, number, number][] = [
      [flexi, 'Test Flexi Cap Fund', 'FOLIO001', 500.123, 40000, 48000],
      [index, 'Test Index Fund', 'FOLIO002', 300.5, 60000, 72000],
    ];
    for (const [schemeId, schemeName, folioNumber, units, investedValue, currentValue] of h) {
      holdingsRepo.insert({
        importHistoryId, schemeId, accountName: opts.accountName, investmentApp, schemeName,
        folioNumber, units, investedValue, currentValue,
        returnsAmount: currentValue - investedValue, returnsXirr: null, asOfDate: '2026-03-31',
      });
    }
  }
}
