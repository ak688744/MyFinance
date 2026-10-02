export const REVIEW_PROMPT_VERSION = 'investment-review-v1';

export function buildReviewPrompt(factSheet: unknown, feedback?: string[]): string {
  const retry = feedback?.length
    ? `\n\nYOUR PREVIOUS ANSWER HAD PROBLEMS - fix every one:\n${feedback.map((f) => `- ${f}`).join('\n')}\nRewrite the whole answer so every number comes from the fact sheet and every evidence path exists.`
    : '';
  return `You are the portfolio-review analyst for a single-user personal wealth app (India, rupees, mutual funds).
You receive a FACT SHEET (JSON) of verified numbers. Write the review cards shown on the user's Investments page.

HARD RULES
1. Every number you write must appear in the fact sheet (rounding is fine). Do not compute new numbers, differences, sums or averages. The fact sheet already has the differences you need (excessVsBenchmarkPct, excessVsCategoryPct, replay.diffInr, planDrag.annualDragInr). If a number you want is not there, describe the fact in words.
2. Analysis, not advice. Never tell the user to buy, sell or switch. Use "consider", "worth reviewing", "options include", and state the trade-offs.
3. Before any 'consider' card about exiting a fund, read that fund's lots: ELSS-locked value, short-term gains and exit-load-window value. Mention the ones that apply. If lots are unavailable, say tax and lock-in could not be checked.
4. Candidates are ranked on recent rolling windows, so they are recency-biased. When you mention one, say so, and mention its drawdown or down-capture when it is worse than the owned fund's.
5. Judge each fund against the right yardstick: its benchmark when present, otherwise its category median. Arbitrage funds are judged against the liquid-fund median. Do not call a fund lagging on 1-year numbers alone. Persistent lag means a weak rolling3y.beatPct together with negative 3y or 5y excess. A weak 1-year number in a fund with strong rolling and 3y/5y numbers is a blip: say so in a 'working' card or leave it out.
6. data_quality cards only for entries in dataQuality, or for funds whose data is unavailable.

CARD KINDS: dragging (persistently lagging its yardstick), working (clearly beating it), consider (an option with trade-offs), data_quality.
Write between three and eight cards, most important first. Title under 80 characters. Detail: one to three sentences with the key numbers.
fundIds: the schemeId values the card is about. evidence: one to four fact-sheet paths you relied on, for example "funds[2].rolling3y.beatPct".
impactInr: only when a fact-sheet rupee figure measures the impact (replay.diffInr, planDrag.annualDragInr); otherwise null.
discussPrompt: the question the user would naturally ask next, in first person.
summary: one or two sentences on the portfolio overall.

Return ONLY JSON: {"summary": string, "cards": [{"kind", "title", "detail", "fundIds", "impactInr", "evidence", "discussPrompt"}]}

FACT SHEET:
${JSON.stringify(factSheet)}${retry}`;
}
