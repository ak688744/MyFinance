# CAS fixtures (synthetic, PII-free)

All files here are hand-written with invented funds, ISINs, folios and amounts.
They imitate the line-grouped text of a CAMS/KFintech CAS (`CAMSCASWS ... Version:V3.5`).
Arithmetic reconciles: running balances, closing units, Total Cost Value and the
PORTFOLIO SUMMARY per-AMC cost. Each `bad`/`unknown`/`nonzero` file breaks exactly one thing.

| File | Purpose |
|---|---|
| cas-single.txt | one scheme, 3 SIP purchases with stamp duty |
| cas-two-folios-same-isin.txt | same ISIN in a Non Demat and a Demat folio |
| cas-zero-balance-and-segregated.txt | fully redeemed folio, segregated portfolio, page break inside a block |
| cas-redemption-reversal.txt | wrapped rows, reversal, rejection, partial FIFO redemptions, noise rows |
| cas-bad-balance.txt | row 2 stated balance wrong (900.955 instead of 899.955); row 3 left unchanged so it also mismatches the chain. Tests should assert on the FIRST reported issue |
| cas-unknown-row.txt | row 3 description is `Switch In - From Other Scheme` (unsupported kind) |
| cas-nonzero-opening.txt | `Opening Unit Balance: 100.000` but first row balance assumes 0 |

## Findings from three real statements (2 holders, 30 scheme blocks, probed 2026-10-26)

Probed from text extracted outside the repo. All example rows, ISINs and numbers below are invented, same shape only.

### Extraction layout (IMPORTANT for the parser task)
- The real extraction used for the probe grouped pdfjs items **by Y coordinate into lines**
  and inserted a `=====PAGE n=====` marker. `packages/api/src/lib/pdfText.ts` as it exists today
  joins all items of a page with a single space and pages with `\n`, i.e. **one very long line
  per page, no row structure**. A line-preserving extraction (new function or option) is
  needed, or the parser must segment rows by the leading `DD-Mon-YYYY` date. These fixtures use
  the line-grouped form.
- Every page repeats a header (`CAMSCASWS-... Version`, `Consolidated Account Statement`,
  period, `Page n of N`, then `Date Amount Price Units Transaction Unit` / `(INR) (INR) Balance`),
  and this can fall in the middle of a scheme block.

### Row shape
Normal row: `DD-Mon-YYYY  amount  price  units  description  balanceAfter`.
- Positive purchase: `4,999.75   10.0000 499.975 Systematic Investment (1)   499.975`.
- Outflow/reversal/rejection: amount and units in parentheses, price positive, balance positive:
  `(8,750.00)   70.0000 (125.000) Redemption ...   155.000`.
- Price (NAV) has 2 to 4 decimals; units 3 decimals; amounts 2 decimals; thousands commas.
- Creation of units - Segregated Portfolio: **no amount and no NAV**:
  `24-Jan-2020   100.000 Creation of units - Segregated Portfolio   100.000`
  (columns: date, units, description, balance). Units positive, several rows on the same date.
- Payment - Units Extinguished: ordinary outflow row with parentheses:
  `15-Jun-2020   (140.00)   1.4000 (100.000) Payment - Units Extinguished   250.500`.
  Successive rows extinguish part, then the remainder, ending at balance `0.000`.
  Cost basis of segregated units is 0 in the folio Total Cost Value (see FIFO below).
- Redemption variants seen: `Redemption`, `Redemption Of Units`, `Redemption less TDS, STT`,
  `Redemption Directly credited to your Bank account (DC-BSE) less TDS,` (wraps),
  `*Redemption(NEFT <BANK>)-BSE - , less STT`, `Redemption - <REF>`,
  `Redemption-BSE - - ELECTRONIC PAYMENT - <REF>`, `Redemption - EXCHANGE PAYOUT , less STT`.
  All parenthesised amount/units.
- Reversal: `Purchase - Systematic-BSE - (Reversal) - Instalment No 3` and
  `...(Reversal - Cheque dishonoured / Collection` + wrapped continuation. Same amount and units
  as the original purchase, parenthesised, balance drops back. Rejection:
  `Systematic Investment Rejection (/)` with the original amount/units parenthesised.
  In every observed case the reversal/rejection equals an earlier purchase of the same folio.

### Wrapped lines
- Long transaction descriptions wrap: the continuation line holds the rest of the description
  (`STT`, `not realised ) - Instalment No 4`, `less TDS, STT`) and the **unit balance may land
  on its own following line** (a bare number). A row is complete only when its balance is read.
- Scheme title wraps over 1 to 3 lines (title, `ISIN : ... ( Advisor : ... )`, `ARN - nnnn )`,
  `Registrar : CAMS|KFINTECH`). Scheme title can contain `( ELSS U / S 80 C of IT ACT )`.
- ISIN is rendered with irregular spaces and may sit on its own line: `INF 123 A 01012`,
  `INF 123 B 013 D 2`, `INF 456 B 01 VK 0` (invented). Strip all whitespace, then expect `INF` + 9 chars (12).
  The ISIN may be the last thing on a title line with `( Advisor :` and the Advisor ID on the next line.
- Plan/holding markers: `( Non Demat )`, `( Non - Demat )`, `( Demat )`.
- Folio formats: `Folio No: 12345678`, `Folio No: 12345678 / 9`, `... / 99` (digits, optional ` / n`).
  Same ISIN occurs in two folios of one holder.

### Per-line markers (no money movement; must be ignored, not errors)
`*** Stamp Duty ***` (amount 0.25 etc., see cost rule), `*** STT Paid ***`,
`***Address Updated from KRA Data***`, `***Change / Regn of Nominee***`,
`***Registration of Nominee***`, `***Change of Date of Birth***`, `***KYC Failed - Updated from KRA Data***`,
`***Cancelled***`, `***Refund Primary KYC ON HOLD ...***` (has an amount, no units),
`***Residual distributable cash balance ... rounding off the NAV to 4 decimals***` (wraps to 2 lines),
`***Insurance SIP Transaction ceased...***`, `******Address Updated from CVL Data******`.
Rule: a dated line containing `***` and no units/balance is noise.

### Row kinds beyond spec section 3
`CSIP Purchase`, `CSIP Purchase Instalment No - n/m`, `Purchase-BSE -`, `Purchase-BSE - - INZ...`,
`New Purchase`, `Systematic Investment New Purchase with SIP (1)`, `Sys. Investment Existing Folio with SIP (n/m)`,
`Purchase Systematic-BSE - Instalment No - n/m`, marker rows above (`Refund Primary KYC...`,
`Residual distributable cash...`, `KYC Failed`, `Insurance SIP ... ceased`). No Switch or Dividend rows
in any of the three statements.

### Cost reconciliation (verified numerically on all three statements)
- Derived running balance equals every stated row balance and every stated Closing Unit Balance.
- **Folio `Total Cost Value` = FIFO remaining cost of units still held, where each purchase's cost is
  amount + the `*** Stamp Duty ***` line that follows it** (purchase row amount is net of stamp duty,
  e.g. 4,999.75 + 0.25 = 5,000.00). Verified on person B (which has redemptions, reversal, rejection,
  segregated + extinguished): matches to within paise-level rounding on every folio.
  Without adding stamp duty, folios with many purchases are off by several rupees, beyond the Rs 1 tolerance. Segregated units carry cost 0; fully exited folios show 0.00.
- Reversed/rejected purchases are removed (together with their stamp duty, if any) before FIFO.
- PORTFOLIO SUMMARY per-AMC cost = sum of that AMC's folio Total Cost Values: exact on all three
  statements, AMC grand Total = sum of all folios. Zero-balance AMCs appear with `0.00   0.00`.
- Market value on summary depends on a statement-date NAV (`NAV on <date>: INR x`), informational only.
- Concern for spec D2/D3: D2 derived cost must include stamp duty; spec section 3 says the purchase
  row "is already net", true for the row amount, but the cost oracle is gross. Importing the net amount
  as the cash flow is a separate decision for the parser task.
