export function buildCcStatementPrompt(statementText: string): string {
  return [
    'You are extracting the spend line items from a credit-card statement.',
    'Return STRICT JSON matching the schema: { "lineItems": [{ "date": "YYYY-MM-DD", "merchant": string, "amount": number }], "detectedTotal": number | null }.',
    'RULES:',
    '- Include every PURCHASE, fee, and interest charge as a line item with a POSITIVE amount.',
    '- Include REFUNDS / reversals / cashbacks as line items with a NEGATIVE amount (they reduce spend).',
    '- EXCLUDE any "payment received" / "previous bill payment" line (money paying off the last bill) — that is not this cycle\'s spend.',
    '- date is the transaction date in YYYY-MM-DD. If the year is absent, infer it from the statement period.',
    '- merchant is a short human-readable name.',
    '- detectedTotal = the statement\'s own printed total of NEW debits / total purchases for this cycle. If you cannot find a printed total, use null.',
    '- Output ONLY the JSON object. No prose, no markdown fences.',
    '',
    'STATEMENT TEXT:',
    statementText,
  ].join('\n');
}
