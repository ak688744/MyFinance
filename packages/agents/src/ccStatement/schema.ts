import { z } from 'zod';

export const CcLineItemSchema = z.object({
  date: z.string(),
  merchant: z.string(),
  amount: z.number(), // signed: purchases/fees/interest positive, refunds negative
});

export const CcStatementParseSchema = z.object({
  lineItems: z.array(CcLineItemSchema),
  detectedTotal: z.number().nullable(),
});

export type CcLineItem = z.infer<typeof CcLineItemSchema>;
export type CcStatementParse = z.infer<typeof CcStatementParseSchema>;

// JSON schema handed to the provider's structured-output mode.
export const CC_STATEMENT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    lineItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          merchant: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['date', 'merchant', 'amount'],
      },
    },
    detectedTotal: { type: ['number', 'null'] },
  },
  required: ['lineItems', 'detectedTotal'],
} as const;
