# Accountant review checklist (W1-13)

**External accounting approval: PENDING.** No accountant has reviewed these rules. Nothing in this repository is an accountant's opinion. Posting code must not start until this review is finished (hard gate before Week 4, `decisions.md`).

Rules under review: [04-business-rules.md](04-business-rules.md). Data model: [03-data-model.md](03-data-model.md).
Arithmetic of every worked example below is checked by `tests/unit/accountant-examples.test.ts` (16 tests, run 2026-11-01, all pass). That proves the numbers follow the stated rules; it does **not** prove the rules are acceptable accounting.

This is a software specification review, not tax or legal advice. Questions about VAT and e-invoicing are out of scope for v1 (D-03) and are listed only to record boundaries.

## How to use

1. Give the accountant `04-business-rules.md`, `decisions.md` and this file.
2. For each question, the accountant marks **Agree / Change / Reject** and writes the required treatment in the response column.
3. Every Change or Reject becomes a change request against `04-business-rules.md`; examples and tests are updated; the checklist is re-issued.
4. Only after the sign-off table below is completed by the accountant may `Status` change from PENDING.

## Sign-off (to be completed by the external accountant)

| Field | Value |
|---|---|
| Reviewer name and qualification | PENDING |
| Firm / registration number | PENDING |
| Date of review | PENDING |
| Rules version reviewed (git commit of `docs/04-business-rules.md`) | PENDING |
| Overall result (Approved / Approved with changes / Rejected) | PENDING |
| Signature | PENDING |

## Questions

Response column legend: A = agree, C = change (describe), R = reject (describe). All responses are currently **PENDING**.

### 1. Chart of accounts and journals (rules §1, §6)

| # | Question | Ref | Response |
|---|---|---|---|
| 1.1 | Is the fixed chart (cash 1100, bank/wallets 1110, receivables 1200, inventory 1300, payables 2100, owner capital/drawings, opening-balance equity 3400, sales 4100, sales discounts 4150 as contra-revenue, sales returns 4200, COGS 5100, inventory adjustments 5200, expenses 6100–6899, rounding 6900, cash over/short 6950) sufficient and correctly classified for a small Egyptian retailer? | §6 | PENDING |
| 1.2 | Is showing gross sales in 4100 with discounts separately in 4150, and reporting net revenue = 4100 − 4150 − 4200, acceptable? | §5.2 | PENDING |
| 1.3 | Are Cr/Dr sides and account types right for every journal template in §5? | §5 | PENDING |
| 1.4 | Should owner drawings (3200) and capital (3100) be separate from retained earnings (3300) as shown? | §5.8 | PENDING |
| 1.5 | Do you need accounts the design omits (e.g. accrued expenses, prepaid, customer deposits)? | §6 | PENDING |

### 2. Purchases, discounts and extra costs (rules §5.1)

| # | Question | Example | Response |
|---|---|---|---|
| 2.1 | Invoice discount is allocated to lines by net line value (largest remainder, ties to lower line number). Acceptable, and is the inventory cost net of discount? | A1: discount 15.00 over 100.00 / 200.00 / 300.00 → 2.50 / 5.00 / 7.50; inventory 97.50 / 195.00 / 292.50 (total 585.00) | PENDING |
| 2.2 | When the discount does not divide evenly, the extra piastre goes to the largest fractional remainder. Acceptable? | A2: discount 10.00 over the same lines → 1.67 / 3.33 / 5.00 | PENDING |
| 2.3 | Which extra costs (transport, loading, customs, insurance) may be capitalised into inventory, and which must be expensed? Is allocation by net line value acceptable? | A3: extra 10.00 over net values 97.50 / 195.00 / 292.50 → 1.67 / 3.33 / 5.00 | PENDING |
| 2.4 | Partial payment on a purchase: Dr Inventory, Cr Cash for the part paid and Cr Payables for the rest. Correct? | §5.1 | PENDING |
| 2.5 | Is it acceptable that supplier price variance on returns is not supported in v1 (credit must equal original cost)? | §5.4 | PENDING |

### 3. Inventory costing (rules §4)

| # | Question | Example | Response |
|---|---|---|---|
| 3.1 | Is moving weighted-average cost, applied in posting order (never re-costed retroactively), acceptable for statutory and tax purposes for these shops? | — | PENDING |
| 3.2 | Cost of an issue is round(value × qty / on-hand); the issue of the last unit takes the whole remaining value so stock value reaches exactly zero. Acceptable? | B1: 10.000 units worth 500.00 + 5.000 for 300.00 = 15.000 / 800.00; sell 4.000 → cost 213.33 (213.333 rounded); remaining 11.000 / 586.67; sell the remaining 11.000 → cost 586.67, value 0.00 | PENDING |
| 3.3 | Rounding of an exact half is away from zero. Acceptable? | B2: 0.05 over 2.000 units, issue 1.000 → 0.03 | PENDING |
| 3.4 | Negative stock is forbidden for all users (D-02). Do your clients ever need otherwise for legal reasons? | — | PENDING |
| 3.5 | Stock adjustments (damage, loss, found, count): Dr/Cr 5200 Inventory adjustments against 1300. Correct classification? | §5.5 | PENDING |
| 3.6 | Backdated documents are costed in posting order, not business-date order. Any statutory objection? | §3 | PENDING |

### 4. Sales and discounts (rules §5.2)

| # | Question | Example | Response |
|---|---|---|---|
| 4.1 | Invoice discount is allocated across lines by net value for later returns and tax. Acceptable? | C1: lines 171.00 and 450.00, discount 30.00 → 8.26 / 21.74; net 162.74 / 428.26 | PENDING |
| 4.2 | Credit/partly paid sale journal: Dr Cash, Dr Receivables, Dr Sales discounts, Cr Sales; and Dr COGS / Cr Inventory for cost. Correct? | C2: total 591.00, paid 200.00 cash, receivable 391.00; debits 621.00 = credits 621.00; COGS 400.00 | PENDING |
| 4.3 | Is selling below cost or at zero price only with permission (and flagged) enough control, or must it also be reported separately? | §5.2 | PENDING |
| 4.4 | Quantity × price is rounded half away from zero to the piastre per line. Acceptable? | C3: 0.350 kg × 85.50 = 29.925 → 29.93 | PENDING |

### 5. Returns (rules §5.3, §5.4)

| # | Question | Example | Response |
|---|---|---|---|
| 5.1 | Returns need an original posted invoice (D-12). Any case your clients legitimately need without one? | — | PENDING |
| 5.2 | Refund uses the cumulative method: refund after each return = round(net line × cumulative returned qty / original qty) minus refunds already paid. Total always equals the original net line value when fully returned. Acceptable? | D1: net 89.99 for 3 pieces returned one by one → 30.00, 29.99, 30.00 (total 89.99); D2: any other split totals 89.99 | PENDING |
| 5.3 | Returned stock is restored at the original sale cost (not today's average) by the same cumulative method. Correct? | D3: cost 213.33 for 4 pieces → 53.33 / 53.34 / 53.33 / 53.33 | PENDING |
| 5.4 | Return journal: Dr Sales returns 4200 (gross value), Cr Sales discounts 4150 (discount share), Cr Cash or Receivables (net refund), plus Dr Inventory / Cr COGS. Correct mapping when the original sale had a discount? | §5.3 | PENDING |
| 5.5 | A return of a credit sale first reduces the invoice receivable, then refunds cash for any remainder. Correct? | §5.3 | PENDING |
| 5.6 | Purchase return removes inventory at the original purchase cost, not current average. Correct? | §5.4 | PENDING |

### 6. Receivables and payables (rules §5.6)

| # | Question | Example | Response |
|---|---|---|---|
| 6.1 | Customer payments are allocated oldest-invoice-first by default (or manually). Acceptable? | E1: payment 80.00 on invoices owing 50.00 and 70.00 → 50.00 and 30.00 | PENDING |
| 6.2 | Overpayment becomes customer credit shown as a negative receivable. Acceptable presentation, or should it be a separate liability account (customer deposits)? | E2: payment 130.00 → 50.00 + 70.00, credit 10.00 | PENDING |
| 6.3 | Supplier payments mirror the above against payables. Any difference you need? | §5.6 | PENDING |
| 6.4 | Credit limits are a control, not an accounting entry. Agree? | §5.2 | PENDING |
| 6.5 | Ageing buckets (0–30, 31–60, 61–90, 90+ days) by invoice business date. Right for your clients? | §PAY-03 | PENDING |

### 7. Opening balances and go-live (rules §5.7)

| # | Question | Example | Response |
|---|---|---|---|
| 7.1 | Opening customer balances: Dr Receivables / Cr Opening-balance equity; suppliers the reverse; opening stock Dr Inventory / Cr Opening-balance equity. Correct? | E4: customer opening 1,234.50 → Dr 1200 / Cr 3400 | PENDING |
| 7.2 | Opening documents are allowed only before a one-time go-live lock. Acceptable, or must adjustments remain possible? | §5.7 | PENDING |
| 7.3 | How should opening-balance equity be cleared at the first year end? | §6 | PENDING |

### 8. Cash drawer and reconciliation (rules §7)

| # | Question | Example | Response |
|---|---|---|---|
| 8.1 | Expected cash = opening float + cash sales + cash receipts + cash-ins − cash refunds − supplier cash payments − drawer expenses − owner drawings − cash-outs. Complete? | E3: 200.00 + 1,500.00 + 300.00 − 50.00 − 400.00 − 100.00 − 200.00 = 1,250.00 | PENDING |
| 8.2 | A counting difference posts to 6950 Cash over/short. Example short 5.00: Dr 6950 5.00 / Cr 1100 5.00. Correct, and is over/short an expense or other income when positive? | E3 | PENDING |
| 8.3 | Electronic payments (card machine, wallets) are recorded to 1110 without reconciliation in v1. Acceptable for pilot? | §5.2 | PENDING |
| 8.4 | Day close locks the business date; later corrections are dated in the open day. Acceptable? | §3 | PENDING |

### 9. Expenses, owner transactions (rules §5.8)

| # | Question | Response |
|---|---|---|
| 9.1 | Expense categories map to 6100–6899. Which standard categories do your clients need preloaded? | PENDING |
| 9.2 | Owner drawings and capital injections as cash movements only. Enough, or do you need drawings against profit accounts? | PENDING |

### 10. Rounding (rules §2)

| # | Question | Response |
|---|---|---|
| 10.1 | No automatic cash rounding to 5 piastres or the pound (D-11). Any shop practice or rule that conflicts? | PENDING |
| 10.2 | All amounts are stored as integer piastres; rounding only at: line total, percentage discount, discount/cost allocation, issue cost, return shares. Is a rounding-differences account (6900) needed for anything else? | PENDING |

### 11. Boundaries (informational, out of v1)

| # | Question | Response |
|---|---|---|
| 11.1 | Which of your clients are VAT-registered or obliged to issue e-receipts/e-invoices? (No tax is calculated in v1.) | PENDING |
| 11.2 | Retention period and format for sales and stock records, and which reports must be producible on demand? | PENDING |
| 11.3 | Does an accountant expect to receive a trial balance or journal export? Format (CSV/XLSX)? | PENDING |

## Worked-example index (all verified arithmetic)

| ID | What it shows | Test |
|---|---|---|
| A1–A3 | Discount and extra-cost allocation | `accountant-examples.test.ts` |
| B1–B2 | Weighted average, last-unit remainder, half rounding | same |
| C1–C3 | Sale discount allocation, balanced journal, fractional quantity | same |
| D1–D4 | Cumulative-method returns (refund and cost) | same |
| E1–E4 | Payment allocation, customer credit, cash reconciliation, opening balance | same |

## Findings so far (developer side, before any accountant input)

- The original wording of the return rule ("the last return takes the remainder") was ambiguous and would give different per-return amounts than the cumulative method. It was clarified in `04-business-rules.md` on 2026-11-01 and is question 5.2 above.
- No accounting rule has been accepted by an accountant. Treat every rule as a proposal.
