export type TxnForPrompt = { id: number; description: string; amount: number; direction: 'debit' | 'credit' };
export type CategoryForPrompt = { id: string; name: string };

export function buildCategorizationPrompt(txns: TxnForPrompt[], categories: CategoryForPrompt[]): string {
  const catList = categories.map((c) => `- ${c.id} (${c.name})`).join('\n');
  const rows = txns
    .map((t) => `{"id": ${t.id}, "description": ${JSON.stringify(t.description)}, "amount": ${t.amount}, "direction": "${t.direction}"}`)
    .join('\n');

  return [
    'You categorize personal bank/UPI expense transactions.',
    'Return ONLY a JSON array; one object per input transaction.',
    '',
    'Allowed categoryId values (use EXACTLY one of these ids, never invent a new one):',
    catList,
    '',
    'For each transaction return: transactionId (echo the input id), categoryId (from the list),',
    'keyword, confidence (0..1), and an optional short reason.',
    '',
    'The keyword MUST be a distinctive lowercase SUBSTRING that literally appears inside the',
    "transaction's description (e.g. \"swiggy\" for \"SWIGGY ORDER 123\"). It is used to build a",
    'reusable substring rule, so choose a merchant-like token — NOT a generic stopword',
    '(avoid: payment, upi, order, purchase, transfer, debit, credit).',
    '',
    'Transactions:',
    rows,
  ].join('\n');
}
