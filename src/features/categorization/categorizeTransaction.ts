import type { SQLiteDatabase } from 'expo-sqlite';

export type CategoryRuleType = 'merchant' | 'upi_note_keyword';

export type StoredCategoryRule = {
  id: number;
  rule_type: CategoryRuleType;
  pattern_value: string;
  category_id: string;
  priority: number;
};

export type CategoryResolution = {
  categoryId: string | null;
  categorySource:
    | 'merchant_rule'
    | 'upi_note_keyword'
    | 'builtin_rule'
    | null;
};

export type CategorizationInput = {
  description: string;
  merchantKey: string | null;
  upiNoteKeyword: string | null;
};

type BuiltinRule = {
  categoryId: string;
  matches: string[];
};

const builtinRules: BuiltinRule[] = [
  {
    categoryId: 'investment',
    matches: ['indian clearing corp', ' ppf', ' nps', 'nps trust', 'zerodha broking'],
  },
  { categoryId: 'loan', matches: [' loan '] },
  { categoryId: 'health', matches: ['dr ', 'medicine', 'vaccine'] },
  { categoryId: 'transport', matches: ['petrol', 'parking', ' cab', ' cav', 'shoffr mobility'] },
  { categoryId: 'groceries', matches: ['zepto', 'grocery', 'banana', 'quick mart'] },
  { categoryId: 'food', matches: ['bakery', 'subway', 'tea', 'snacks', 'dinner', 'breakfast', 'cake'] },
  { categoryId: 'travel', matches: ['agoda', 'hotel rio', 'indian railway cater'] },
  {
    categoryId: 'bills',
    matches: ['autopay', 'netflix', 'airtel', 'actcorp', 'electrical', 'electrician', 'pmsby'],
  },
  { categoryId: 'shopping', matches: ['toys jungle', 'photo copy', 'merchant 20qr', 'pvr limited'] },
  { categoryId: 'transfer', matches: ['sent using paytm', 'phonepe '] },
];

const genericUpiNotes = new Set([
  'payment from phone',
  'payment',
  'upi',
  'upiintent',
  'execution test',
  'sent using paytm u',
  'sent using paytm',
  'pay to bharatpe me',
]);

export async function getActiveCategoryRules(db: SQLiteDatabase) {
  return db.getAllAsync<StoredCategoryRule>(`
    SELECT id, rule_type, pattern_value, category_id, priority
    FROM category_rules
    WHERE is_active = 1
    ORDER BY priority DESC, id DESC
  `);
}

export function extractMerchantKey(description: string) {
  const raw = description.trim();

  if (/^UPI-/i.test(raw)) {
    const parts = raw.split('-').map(cleanSegment).filter(Boolean);
    const candidate = parts[1] ?? '';
    const normalized = normalizeRuleValue(candidate);
    return isUsefulMerchant(normalized) ? normalized : null;
  }

  const achMatch = raw.match(/^ACH\s+[DC]-\s*([A-Z0-9 .&]+?)(?:-\d|$)/i);
  if (achMatch?.[1]) {
    const normalized = normalizeRuleValue(achMatch[1]);
    return isUsefulMerchant(normalized) ? normalized : null;
  }

  const posMatch = raw.match(
    /^POS\s+\S+\s+\S+(?:\s+\d{2}[A-Z]{3}\d{2})?(?:\s+\d{2}:\d{2}:\d{2})?\s+(.+)$/i
  );
  if (posMatch?.[1]) {
    const normalized = normalizeRuleValue(posMatch[1]);
    return isUsefulMerchant(normalized) ? normalized : null;
  }

  return null;
}

export function extractUpiNoteKeyword(description: string) {
  if (!/^UPI-/i.test(description.trim())) {
    return null;
  }

  const parts = description
    .split('-')
    .map(cleanSegment)
    .filter(Boolean);

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = normalizeRuleValue(parts[index]);

    if (!isUsefulUpiNote(candidate)) {
      continue;
    }

    return candidate;
  }

  return null;
}

export function createCategorizationInput(description: string): CategorizationInput {
  return {
    description,
    merchantKey: extractMerchantKey(description),
    upiNoteKeyword: extractUpiNoteKeyword(description),
  };
}

export function resolveCategoryFromRules(
  input: CategorizationInput,
  storedRules: StoredCategoryRule[]
): CategoryResolution {
  if (input.merchantKey) {
    const merchantRule = storedRules.find(
      (rule) =>
        rule.rule_type === 'merchant' && rule.pattern_value === input.merchantKey
    );

    if (merchantRule) {
      return {
        categoryId: merchantRule.category_id,
        categorySource: 'merchant_rule',
      };
    }
  }

  if (input.upiNoteKeyword) {
    const upiNoteRule = storedRules.find(
      (rule) =>
        rule.rule_type === 'upi_note_keyword' &&
        rule.pattern_value === input.upiNoteKeyword
    );

    if (upiNoteRule) {
      return {
        categoryId: upiNoteRule.category_id,
        categorySource: 'upi_note_keyword',
      };
    }
  }

  const normalizedDescription = ` ${normalizeRuleValue(input.description)} `;
  const builtinRule = builtinRules.find((rule) =>
    rule.matches.some((pattern) => normalizedDescription.includes(pattern))
  );

  return {
    categoryId: builtinRule?.categoryId ?? null,
    categorySource: builtinRule ? 'builtin_rule' : null,
  };
}

export async function saveCategoryMemoryRule(
  db: SQLiteDatabase,
  input: {
    ruleType: CategoryRuleType;
    patternValue: string | null;
    categoryId: string;
    createdFromTransactionId: number;
  }
) {
  if (!input.patternValue) {
    return;
  }

  const priority = input.ruleType === 'merchant' ? 200 : 100;

  await db.runAsync(
    `
      INSERT INTO category_rules (
        rule_type,
        pattern_value,
        category_id,
        priority,
        created_from_transaction_id
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(rule_type, pattern_value)
      DO UPDATE SET
        category_id = excluded.category_id,
        priority = excluded.priority,
        is_active = 1
    `,
    input.ruleType,
    input.patternValue,
    input.categoryId,
    priority,
    input.createdFromTransactionId
  );
}

export async function recategorizeNonManualTransactions(db: SQLiteDatabase) {
  const rules = await getActiveCategoryRules(db);
  const transactions = await db.getAllAsync<{
    id: number;
    description: string;
    category_source: string | null;
  }>(`
    SELECT id, description, category_source
    FROM transactions
    WHERE category_source IS NULL OR category_source != 'manual'
  `);

  for (const transaction of transactions) {
    const resolution = resolveCategoryFromRules(
      createCategorizationInput(transaction.description),
      rules
    );

    await db.runAsync(
      `
        UPDATE transactions
        SET category_id = ?, category_source = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      resolution.categoryId,
      resolution.categorySource,
      transaction.id
    );
  }
}

function normalizeRuleValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSegment(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function isUsefulMerchant(value: string) {
  if (!value || value.length < 3) {
    return false;
  }

  if (/^x+\d*$/.test(value)) {
    return false;
  }

  return /[a-z]/.test(value);
}

function isUsefulUpiNote(value: string) {
  if (!value || value.length < 3) {
    return false;
  }

  if (genericUpiNotes.has(value)) {
    return false;
  }

  if (!/[a-z]/.test(value)) {
    return false;
  }

  const digitCount = (value.match(/\d/g) ?? []).length;
  return digitCount <= Math.floor(value.length / 2);
}
