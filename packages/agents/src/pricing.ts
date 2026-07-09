// USD per 1M tokens. CONVENIENCE PREFILL ONLY — the source of truth for cost is
// the user-entered price on each ai_models row. Keyed by literal model_string.
// Update by editing this table; because cost is frozen at write time, edits only
// affect prefill suggestions, never recorded history.
export const PRICING_HINTS: Record<string, { inputPerM: number; outputPerM: number; source: string; asOf: string }> = {
  'gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5, source: 'ai.google.dev/pricing', asOf: '2026-07' },
  'gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10.0, source: 'ai.google.dev/pricing', asOf: '2026-07' },
};

export function pricingHint(modelString: string): { inputPerM: number; outputPerM: number } | null {
  const h = PRICING_HINTS[modelString];
  return h ? { inputPerM: h.inputPerM, outputPerM: h.outputPerM } : null;
}

export function costUsd(inTok: number, outTok: number, inputPerM: number, outputPerM: number): number {
  return (inTok / 1_000_000) * inputPerM + (outTok / 1_000_000) * outputPerM;
}
