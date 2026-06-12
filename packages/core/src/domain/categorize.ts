import type {
  CategoryRuleRepo,
  CategoryRuleType,
  ExpenseTransactionRepo,
  StoredCategoryRule,
} from '../repositories/types';

/**
 * Faithful port of the categorization engine from
 * src/features/categorization/categorizeTransaction.ts and manageRules.ts.
 *
 * PURE matching functions (extractMerchantKey, extractUpiNoteKeyword,
 * createCategorizationInput, resolveCategoryFromRules, builtinRules and the
 * private normalize/clean/isUseful helpers) are ported VERBATIM. The ONLY
 * change in resolveCategoryFromRules is reading the camelCase StoredCategoryRule
 * fields (ruleType/patternValue/categoryId) instead of the source's snake_case
 * (rule_type/pattern_value/category_id) — a mechanical field rename. Matching
 * precedence and substring logic are byte-identical.
 *
 * DB-touching functions are repo-injected: better-sqlite3 repos are SYNCHRONOUS,
 * so these are synchronous (no async/await). The repo layer owns all SQL/Drizzle.
 *
 * NOTE: category CRUD (create/rename/delete) deferred — see manageCategories.ts;
 * needs CategoryRepo extension.
 */

export type {
  CategoryRuleType,
  StoredCategoryRule,
} from '../repositories/types';

export type CategoryResolution = {
  categoryId: string | null;
  categorySource: 'merchant_rule' | 'upi_note_keyword' | 'builtin_rule' | null;
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
        rule.ruleType === 'merchant' && rule.patternValue === input.merchantKey
    );

    if (merchantRule) {
      return {
        categoryId: merchantRule.categoryId,
        categorySource: 'merchant_rule',
      };
    }
  }

  if (input.upiNoteKeyword) {
    const upiNoteRule = storedRules.find(
      (rule) =>
        rule.ruleType === 'upi_note_keyword' &&
        rule.patternValue === input.upiNoteKeyword
    );

    if (upiNoteRule) {
      return {
        categoryId: upiNoteRule.categoryId,
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

// ---------------------------------------------------------------------------
// Repo-injected (synchronous) — orchestration that touches the DB via repos.
// ---------------------------------------------------------------------------

export type RecategorizeDeps = {
  ruleRepo: CategoryRuleRepo;
  txRepo: ExpenseTransactionRepo;
};

/**
 * Port of recategorizeNonManualTransactions. Re-derives the categorization
 * input from the transaction description (same as source) rather than trusting
 * stored merchant_key/upi_note_keyword columns.
 */
export function recategorizeNonManualTransactions(deps: RecategorizeDeps): void {
  const rules = deps.ruleRepo.getActiveRules();
  const transactions = deps.txRepo.getNonManualForRecategorization();

  for (const transaction of transactions) {
    const resolution = resolveCategoryFromRules(
      createCategorizationInput(transaction.description),
      rules
    );

    deps.txRepo.updateCategory(
      transaction.id,
      resolution.categoryId,
      resolution.categorySource
    );
  }
}

/** Port of saveCategoryMemoryRule. */
export function saveCategoryMemoryRule(
  deps: { ruleRepo: CategoryRuleRepo },
  input: {
    ruleType: CategoryRuleType;
    patternValue: string | null;
    categoryId: string;
    createdFromTransactionId: number;
  }
): void {
  if (!input.patternValue) {
    return;
  }

  const priority = input.ruleType === 'merchant' ? 200 : 100;

  deps.ruleRepo.createRule({
    ruleType: input.ruleType,
    patternValue: input.patternValue,
    categoryId: input.categoryId,
    priority,
    createdFromTransactionId: input.createdFromTransactionId,
  });
}

/** Port of manageRules.createRule. */
export function createRule(
  deps: RecategorizeDeps,
  input: { ruleType: CategoryRuleType; patternValue: string; categoryId: string }
): void {
  const normalizedPatternValue = normalizePatternValue(input.patternValue);

  if (!normalizedPatternValue) {
    throw new Error('Rule pattern cannot be empty.');
  }

  const priority = input.ruleType === 'merchant' ? 200 : 100;

  deps.ruleRepo.createRule({
    ruleType: input.ruleType,
    patternValue: normalizedPatternValue,
    categoryId: input.categoryId,
    priority,
  });

  recategorizeNonManualTransactions(deps);
}

/**
 * Port of manageRules.updateRuleCategory. Source sets category_id AND rule_type
 * AND priority (merchant?200:100); the repo's updateRuleCategory was extended to
 * accept ruleType + priority for a faithful port.
 */
export function updateRuleCategory(
  deps: RecategorizeDeps,
  input: { ruleId: number; categoryId: string; ruleType: CategoryRuleType }
): void {
  const priority = input.ruleType === 'merchant' ? 200 : 100;

  deps.ruleRepo.updateRuleCategory(
    input.ruleId,
    input.categoryId,
    input.ruleType,
    priority
  );

  recategorizeNonManualTransactions(deps);
}

/** Port of manageRules.deleteRule. */
export function deleteRule(deps: RecategorizeDeps, input: { ruleId: number }): void {
  deps.ruleRepo.deleteRule(input.ruleId);

  recategorizeNonManualTransactions(deps);
}

// ---------------------------------------------------------------------------
// Private helpers — ported VERBATIM.
// ---------------------------------------------------------------------------

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

/** Port of manageRules.normalizePatternValue (identical to normalizeRuleValue). */
function normalizePatternValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Port of manageCategories.slugifyCategoryName (used by deferred category CRUD). */
export function slugifyCategoryName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
