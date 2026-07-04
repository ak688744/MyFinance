import { z } from 'zod';

export const AiSuggestionSchema = z.object({
  transactionId: z.number().int(),
  categoryId: z.string().min(1),
  keyword: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
});

export const AiSuggestionBatchSchema = z.array(AiSuggestionSchema);

export type AiSuggestion = z.infer<typeof AiSuggestionSchema>;

// JSON schema handed to the provider's structured-output mode (Gemini responseSchema).
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      transactionId: { type: 'integer' },
      categoryId: { type: 'string' },
      keyword: { type: 'string' },
      confidence: { type: 'number' },
      reason: { type: 'string' },
    },
    required: ['transactionId', 'categoryId', 'keyword', 'confidence'],
  },
} as const;
