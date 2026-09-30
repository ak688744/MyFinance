import { z } from 'zod';

export const REVIEW_CARD_KINDS = ['dragging', 'working', 'consider', 'data_quality'] as const;

export const ReviewCardSchema = z.object({
  kind: z.enum(REVIEW_CARD_KINDS),
  title: z.string().min(1).max(160),
  detail: z.string().max(800),
  fundIds: z.array(z.number().int()),
  impactInr: z.number().finite().nullable().optional(),
  evidence: z.array(z.string()).max(6),
  discussPrompt: z.string().max(300),
});

export const InvestmentReviewSchema = z.object({
  summary: z.string().max(600),
  cards: z.array(ReviewCardSchema).max(12),
});

export type ReviewCard = z.infer<typeof ReviewCardSchema>;
export type InvestmentReview = z.infer<typeof InvestmentReviewSchema>;

// Structured-output JSON schema (Gemini responseSchema / Bedrock forced tool-use), same style as insights/schema.ts.
export const REVIEW_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...REVIEW_CARD_KINDS] },
          title: { type: 'string' },
          detail: { type: 'string' },
          fundIds: { type: 'array', items: { type: 'integer' } },
          impactInr: { type: 'number', nullable: true },
          evidence: { type: 'array', items: { type: 'string' } },
          discussPrompt: { type: 'string' },
        },
        required: ['kind', 'title', 'detail', 'fundIds', 'evidence', 'discussPrompt'],
      },
    },
  },
  required: ['summary', 'cards'],
} as const;
