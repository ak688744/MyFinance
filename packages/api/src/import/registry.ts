import {
  parseHdfcStatementXls,
  parseGrowwHoldingsXls,
  parseGrowwTransactionXls,
} from '@myfinance/core';

/** What kind of file is being imported (decoupled from platform). */
export type ImportKind = 'expense' | 'holdings' | 'transactions';

/**
 * A parser takes the uploaded file bytes (+ optional filename) and returns the
 * normalized ParsedData the core orchestrator for that kind consumes. The
 * concrete return type varies by kind; callers narrow via the kind they
 * requested, so the registry value is typed loosely (the route casts the
 * result into the orchestrator's expected input).
 */
type AnyParser = (buffer: ArrayBuffer, filename?: string) => unknown;

const REGISTRY: Record<string, Partial<Record<ImportKind, AnyParser>>> = {
  hdfc: {
    expense: parseHdfcStatementXls as AnyParser,
  },
  groww: {
    holdings: parseGrowwHoldingsXls as AnyParser,
    transactions: parseGrowwTransactionXls as AnyParser,
  },
};

/**
 * Resolve the parser for a (platform, kind) pair. Platform is matched
 * case-insensitively. Throws an HTTP-400-flagged Error for unsupported pairs so
 * the global error handler surfaces a clean 400 (D6).
 *
 * Adding a new platform = add an entry here + its parser module. No route or
 * orchestrator changes.
 */
export function resolveParser(platform: string, kind: ImportKind): AnyParser {
  const parser = REGISTRY[platform.toLowerCase()]?.[kind];
  if (!parser) {
    const err = new Error(
      `Unsupported import: platform="${platform}", kind="${kind}".`,
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  return parser;
}
