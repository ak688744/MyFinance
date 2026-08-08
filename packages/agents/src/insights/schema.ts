import { z } from 'zod';

/** Controlled cadence vocabulary — exactly one per kept event drives forecasting. */
export const CADENCE_VOCAB = ['recurring', 'one_off', 'subscription', 'reimbursable', 'irregular'] as const;

// Each answer option carries the tags (and optional category correction) it applies,
// so tapping a button resolves the event INSTANTLY with no further LLM call — and
// different options apply different metadata (e.g. "Car loan" → recurring,loan_payment
// vs "One-off purchase" → one_off,car_purchase).
export const TriageOptionSchema = z.object({
  label: z.string(),
  tags: z.array(z.string()),
  categoryFix: z.string().nullable(),
});

export const TriageVerdictSchema = z.object({
  eventId: z.string(),
  tier: z.enum(['suppress', 'needs_input', 'worth_knowing']),
  keep: z.boolean(),
  lane: z.enum(['needs_input', 'worth_knowing']).nullable(),
  refinedTitle: z.string(),
  refinedDetail: z.string(),
  question: z.string().nullable(),
  options: z.array(TriageOptionSchema),
  reason: z.string(),
});

export const TriageResponseSchema = z.object({
  verdicts: z.array(TriageVerdictSchema),
});

export type TriageOption = z.infer<typeof TriageOptionSchema>;
export type TriageVerdict = z.infer<typeof TriageVerdictSchema>;

// JSON schema for providers with structured-output mode (Gemini responseSchema).
export const TRIAGE_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          tier: { type: 'string', enum: ['suppress', 'needs_input', 'worth_knowing'] },
          keep: { type: 'boolean' },
          lane: { type: 'string', enum: ['needs_input', 'worth_knowing'], nullable: true },
          refinedTitle: { type: 'string' },
          refinedDetail: { type: 'string' },
          question: { type: 'string', nullable: true },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
                categoryFix: { type: 'string', nullable: true },
              },
              required: ['label', 'tags'],
            },
          },
          reason: { type: 'string' },
        },
        required: ['eventId', 'tier', 'keep', 'refinedTitle', 'refinedDetail', 'options', 'reason'],
      },
    },
  },
  required: ['verdicts'],
} as const;
