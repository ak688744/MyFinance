type TransactionPresentationInput = {
  description: string;
  merchantKey: string | null;
  upiNoteKeyword: string | null;
};

export function presentTransaction(input: TransactionPresentationInput) {
  return {
    typeLabel: getTransactionTypeLabel(input.description),
    merchantLabel: getMerchantLabel(input),
    noteLabel: getNoteLabel(input),
  };
}

function getTransactionTypeLabel(description: string) {
  const raw = description.trim().toUpperCase();

  if (raw.startsWith('UPI-')) return 'UPI';
  if (raw.startsWith('ACH ')) return 'ACH';
  if (raw.startsWith('POS ')) return 'CARD';
  if (raw.startsWith('NWD-')) return 'CASH';
  if (raw.startsWith('CC ')) return 'AUTO PAY';
  if (raw.startsWith('JNS-')) return 'INSURANCE';

  return 'BANK';
}

function getMerchantLabel(input: TransactionPresentationInput) {
  if (input.merchantKey) {
    return titleize(input.merchantKey);
  }

  const cleaned = input.description
    .replace(/^[A-Z ]+-/i, '')
    .split('-')[0]
    .trim();

  return titleize(cleaned || input.description);
}

function getNoteLabel(input: TransactionPresentationInput) {
  if (!input.upiNoteKeyword) {
    return null;
  }

  const note = titleize(input.upiNoteKeyword);
  const merchant = input.merchantKey ? titleize(input.merchantKey) : null;

  return note === merchant ? null : note;
}

function titleize(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
