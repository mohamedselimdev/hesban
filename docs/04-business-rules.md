# HESBAN — Accounting and Inventory Business-Rule Specification

Status: APPROVED WITH CONDITIONS (see [decisions.md](decisions.md)) — **accountant validation required before Week 4; no posting code is written before it**
Revised: 2026-11-01 · Items marked (Dxx) refer to approved decisions.

This is not tax or legal advice. Accounting treatments below are standard small-business practice; they must be reviewed by the owner (and ideally by an Egyptian accountant) before pilot.

## 1. Principles

1. Posted = immutable. Corrections are new documents that reference the original.
2. Every posting is atomic, idempotent and leaves ledgers consistent (stock, cash, party, journal).
3. All amounts are integer piastres; all quantities are integer thousandths; all rounding is explicit and tested.
4. Historical cost is preserved: a sale records the cost it consumed; a return restores that cost, not today's.
5. The system refuses rather than guesses: ambiguous or inconsistent input is rejected with a clear Arabic message.

## 2. Numeric rules

| Rule | Definition |
|---|---|
| Money unit | piastre (1 EGP = 100). |
| Quantity unit | 1/1000 of base unit. Piece-type units reject non-integer quantities. |
| Rounding | **Round half away from zero** at defined points only (below). Implemented once in `domain/money`. |
| Line total (sale) | `round(unit_price_pt × qty_milli / 1000) − line_discount_pt`. |
| Percent discount | Converted to piastres at entry: `round(base × pct)`, the piastre amount is what is stored. |
| Invoice discount allocation | Allocated across lines proportionally to line net, by **largest remainder** so the lines sum exactly to the invoice discount. Needed for returns and future tax. |
| Intermediate math | BigInt; never floating point. |
| Display and input | Western digits by default; Arabic-Indic display option (D-06). Digits typed in Arabic-Indic or Persian forms are normalised to ASCII on entry; stored values are integers only. |

No automatic cash rounding to 5 piastres or whole EGP (D-11). Account 6900 is reserved for explicit, documented rounding differences only.

## 3. Document lifecycle

```
draft ──post──▶ posted ──cancel/reverse──▶ reversed (original kept; counter-entries created)
  │
  └─delete (drafts only; audited)
```
- Only drafts may be edited or deleted. Held carts are non-financial.
- Posting requires: valid permission, open shift (for sales/cash effects), open business date, command_id.
- Cancelling a posted document creates a reversal: stock restored at the document's **original cost**, journal entry reversed, payment reversed; document status → `reversed`; the number is not reused (gapless numbering survives, the gap is explained by the reversed document).
- Cancel authority: Manager same business day; Owner any open date; reason mandatory; always audited. Reversal posts on the **current** open business date, referencing the original.
- A document belonging to a **closed** business day can only be corrected by a return/adjustment dated in the open day.
- Backdating: new documents default to the current business date. Backdating requires Manager permission and may only target an open date. **Costing order is posting order, not business-date order (approved D-04); no retroactive recosting; closed periods are locked** — a backdated purchase affects average cost from the moment it is posted.

## 4. Inventory costing — weighted average (moving)

State per product: `qty` (milli) and `value` (piastres). Average cost is *derived*: `avg = value / qty`; it is never stored as truth. Tracking value (not unit cost) avoids sub-piastre drift.

**Receipt** (purchase, opening stock, positive adjustment, customer return at original cost):
```
qty'   = qty + q
value' = value + v          // v = cost of what entered, in piastres
```
- Purchase `v` = line total after invoice-discount allocation (+ allocated eligible extra costs, D-08). The entered line total is authoritative; unit cost is displayed only.
- Positive adjustment / opening stock: `v` is entered by the user (mandatory, may be 0 only with Manager permission and audit).

**Issue** (sale, negative adjustment, supplier return handled in §5.4):
```
if q == qty:  c = value                       // last unit takes the remainder
else:         c = round(value × q / qty)      // BigInt, half away from zero
qty'   = qty − q
value' = value − c
```
- Invariant: `qty == 0 ⇒ value == 0`; `value ≥ 0`; `qty ≥ 0` — always, for every role.
- COGS for the sale line = `c`. Stored on the invoice line and in the movement.
- Each movement records `qty_after` and `value_after`, so costing can be replayed and verified.

**Negative stock — prohibited (D-02, ADR-016)**
- Any issue with `q > qty` is rejected for every role including Owner. No setting, no override, no estimated-cost selling.
- Check and the stock update happen inside the posting transaction; a rejected posting leaves no side effects. The UI shows the available quantity and points to purchase or stock-adjustment entry.
- Because stock never goes negative, no provisional or estimated costs exist anywhere in the ledger.

**Cost of items with unknown cost**: opening stock without cost is rejected unless explicitly overridden.

**Selling below cost / at 0**: allowed only with permission, flagged `below_cost_flag`, audited, and reported.

## 5. Document rules

### 5.1 Purchase invoice (posted)
- Supplier required. Lines: product, qty > 0, line total ≥ 0.
- Invoice discount allocated to lines (largest remainder). Receipt per §4.
- Additional costs (transport, loading, etc.): each is flagged eligible (capitalised) or ineligible (expensed). Eligible total is allocated across lines proportionally to net line value (line total after discount) using largest remainder; ties go to the lower `line_no`; Σ allocated = eligible total exactly. Allocated amounts are added to each line's inventory value. Ineligible costs post `Dr Expense`. Eligibility rules need accountant confirmation.
- Payment: `paid ≥ 0`, `paid ≤ total`; unpaid part increases supplier payable. Overpayment is handled as a separate supplier payment, not on the invoice.
- Journal: `Dr Inventory (total after discount[, + extras]) / Cr Cash or Bank (paid) / Cr Accounts Payable (unpaid)`.

### 5.2 Sales invoice (posted)
- Lines: product active, qty > 0, price ≥ 0 (price 0 or below cost needs permission). Fractions only for fractional units.
- Customer required if any amount is unpaid (credit sale) or if customer credit limit is relevant; walk-in allowed for fully paid sales.
- Credit limit: `existing receivable + new unpaid > limit` ⇒ blocked unless Manager override (audited).
- Stock availability checked inside the transaction (§4); insufficient stock rejects the whole posting for every role.
- Payments: sum of tendered methods; cash change is computed and recorded (change is not a payment). Electronic cannot exceed the amount due. `paid ≤ total`.
- Journal (single entry):
  - `Dr Cash / Dr Bank-Wallet / Dr Accounts Receivable` (amounts received / unpaid)
  - `Cr Sales Revenue 4100` (gross lines total before discount) and `Dr Sales Discounts 4150` (total line + invoice discounts), so discounts stay separately auditable (D-01). Reports show net revenue = 4100 − 4150 − 4200.
  - `Dr Cost of Goods Sold / Cr Inventory` (Σ line COGS)
- Gapless number allocated inside the transaction.

### 5.3 Sales return
- Must reference an original posted sales invoice line; returned qty cumulatively ≤ original qty.
- Refund value per line = original net unit value × returned qty, rounded; cumulative refund over all returns of that line never exceeds the original line total (the last return takes the remainder).
- Stock restored at **original cost**: `restored_cost = round(orig_cogs × q / orig_q)`; last return of the line takes the remaining cogs. Receipt per §4.
- Settlement: first reduce the invoice's outstanding receivable (credit invoices); any remainder is refunded (cash/electronic from the drawer) or left as customer credit if a customer is attached and chosen.
- Journal: `Dr Sales Returns 4200 (gross line value returned) / Cr Sales Discounts 4150 (discount share of returned qty) / Cr Cash or Receivable (net refund)`; `Dr Inventory / Cr COGS`. Mapping to be confirmed by the accountant.
- Return without an original posted invoice is not supported (D-12). No override and no manual stock-in + cash-out workaround for refunds.
- Remaining returnable qty per line = sold − Σ posted, non-reversed returns; evaluated inside the posting transaction. Refund per line is capped at the original line value less prior refunds. A repeated command (`command_id`) or a second attempt after the cap is reached is rejected, so a duplicate refund is impossible. Returns against a reversed invoice are rejected.
- Returns of a product that was later archived: allowed (products are never deleted).
- Time limit for returns: configurable setting, default none.

### 5.4 Purchase return
- Must reference the original purchase line; qty cumulatively ≤ original qty and ≤ current on-hand.
- Inventory value removed = `round(orig_line_value × q / orig_q)` (original purchase cost, not today's average) with last-return remainder rule; quantity and value both reduce (`qty' = qty − q`, `value' = value − v`). If that would make value negative or leave qty=0 with value≠0, the document is rejected with an explanation (indicates costing inconsistency).
- Settlement: reduces payable (if unpaid) or creates supplier refund/credit. If the supplier credits a different amount than cost, the difference posts to `Purchase Price Variance` expense/other income account — **not supported in v1**; v1 requires credit = cost value and states so.
- Journal: `Dr Accounts Payable or Cash / Cr Inventory`.

### 5.5 Stock adjustment
- Reasons: damage, loss, found, count correction, other (mandatory note). Decrease issues at average cost; increase requires a unit cost (default current average).
- Journal: `Dr Inventory Adjustments (expense) / Cr Inventory` (decrease); reverse for increase.
- Manager permission; large adjustments (> configurable % of stock value) require Owner.

### 5.6 Payments (party)
- Receipt from customer: `Dr Cash/Bank / Cr Accounts Receivable`. Payment to supplier: `Dr Accounts Payable / Cr Cash/Bank`.
- Allocation: optional explicit allocation to specific open invoices; default = oldest first (FIFO by business date, then number). Unallocated remainder stays as party credit (negative receivable shown as "رصيد دائن").
- Allocation cannot exceed an invoice's outstanding; payment cannot be allocated to reversed documents.
- Reversing a payment restores outstanding amounts; payments are reversed, never edited.
- Payments to a supplier in cash reduce the drawer's expected cash; electronic payments do not.

### 5.7 Opening balances (go-live)
- Customer opening balance: `Dr Accounts Receivable / Cr Opening Balance Equity`; supplier: `Dr Opening Balance Equity / Cr Accounts Payable`.
- Opening stock: `Dr Inventory / Cr Opening Balance Equity` through `opening` stock movements.
- Opening cash float is per shift (not equity).
- Opening documents are allowed only before the **go-live lock** (one-time action by Owner after which opening types are disabled).

### 5.8 Expenses and owner transactions
- Expense: `Dr Expense account (category) / Cr Cash (if paid from drawer) or Cr Bank`.
- Owner drawings: `Dr Owner Drawings / Cr Cash`; capital in: `Dr Cash / Cr Owner Capital`.
- Cash-in/out without category is not allowed; a reason from a fixed list plus free text is required.

## 6. Chart of accounts (fixed, seeded; names in Arabic in UI)

| Code | Name | Type |
|---|---|---|
| 1100 | Cash drawer — نقدية الدرج | Asset |
| 1110 | Bank / wallets — بنك ومحافظ | Asset |
| 1200 | Accounts receivable — العملاء | Asset |
| 1300 | Inventory — المخزون | Asset |
| 1400 | Input VAT (reserved, unused v1) | Asset |
| 2100 | Accounts payable — الموردون | Liability |
| 2200 | Output VAT (reserved, unused v1) | Liability |
| 3100 | Owner capital | Equity |
| 3200 | Owner drawings | Equity (contra) |
| 3300 | Retained earnings | Equity |
| 3400 | Opening balance equity | Equity |
| 4100 | Sales revenue | Revenue |
| 4150 | Sales discounts | Contra revenue |
| 4200 | Sales returns | Contra revenue |
| 5100 | Cost of goods sold | Expense |
| 5200 | Inventory adjustments | Expense |
| 6100–6899 | Operating expenses by category | Expense |
| 6900 | Rounding differences | Expense |
| 6950 | Cash over/short | Expense |

Party sub-ledger is carried on `journal_lines.party_id` for 1200 and 2100.

## 7. Cash shift rules

- A cashier must have an open shift to post any cash-affecting document. One active shift per register; v1 has one register (D-07). Opening balance is mandatory at open; closing count is mandatory at close.
- Expected cash = opening float + cash sales + cash receipts + cash-ins − cash refunds − supplier cash payments − expenses from drawer − drawings − cash-outs.
- Close: user enters counted cash (blind count option — expected hidden from cashier); difference is recorded to 6950 with a note; shift becomes immutable.
- Business-day close (Owner/Manager) requires all shifts closed; produces Z-report snapshot; locks the date.
- Z-report cannot be edited; a reprint is marked "نسخة".

## 8. Permission matrix (v1)

| Action | Cashier | Manager | Owner |
|---|---|---|---|
| Sell at catalog price | ✔ | ✔ | ✔ |
| Line discount up to limit | ✔ (limit: setting) | ✔ | ✔ |
| Discount above limit / price override / sell below cost | ✖ | ✔ | ✔ |
| Credit sale / exceed credit limit | credit ✔ / override ✖ | ✔ | ✔ |
| Sales return | ✖ (request) | ✔ | ✔ |
| Cancel posted invoice | ✖ | same day | ✔ |
| Purchases, supplier payments | ✖ | ✔ | ✔ |
| Stock adjustment | ✖ | ✔ (limit) | ✔ |
| View cost / profit | ✖ | ✔ | ✔ |
| Manage products/prices | ✖ | ✔ | ✔ |
| Users, settings, license | ✖ | ✖ | ✔ |
| Backup / restore | backup ✖ | backup ✔ | ✔ restore Owner only |
| Day close | ✖ | ✔ | ✔ |
| View audit log | ✖ | ✖ | ✔ |
| Full data export | ✖ | ✖ | ✔ |

## 9. Invariants (machine-checked by tests **and** by the shipped integrity tool)

| ID | Invariant |
|---|---|
| INV-A | For every journal entry: Σdebit = Σcredit. |
| INV-B | Trial balance: Σ all debits = Σ all credits. |
| INV-C | For each product: `stock_balances.qty` = Σ `qty_delta` of its movements; same for value. |
| INV-D | Account 1300 balance = Σ `stock_balances.value`. |
| INV-E | Account 1200 balance = Σ customer balances; 2100 = Σ supplier balances. |
| INV-F | Each invoice: Σ line totals − invoice discount = total; allocations ≤ total; outstanding ≥ 0. |
| INV-G | Cash drawer account movement per shift = Σ `cash_movements`. |
| INV-H | `qty = 0 ⇒ value = 0`; `value ≥ 0`. |
| INV-I | Document numbers per series have no gaps (reversed documents keep their numbers). |
| INV-J | Replaying movements in `seq` order reproduces every `qty_after`/`value_after`. |
| INV-K | Audit hash chain verifies end to end. |
| INV-L | No posted document or ledger row has changed since creation (hash of canonical snapshot stored at posting matches). |

## 10. Edge cases the implementation must handle (each becomes a test)

1. Double-click / retry of the same sale ⇒ one invoice (idempotency).
2. Power loss mid-posting ⇒ either whole invoice or nothing (crash-injection).
3. Sale of the last unit leaves residue value ⇒ COGS takes the remainder; stock value exactly 0.
4. Weighted average after interleaved purchases at different prices and partial sales.
5. Fractional quantities (0.350 kg × 85.50 EGP = 29.93 EGP, half-up) and tiny quantities.
6. Invoice discount that does not divide evenly across lines (largest remainder).
7. Partial payment then later payments allocated oldest-first; overpayment becomes credit.
8. Return of part of a partially paid credit invoice (reduces receivable first, then refunds).
9. Two returns of the same line summing exactly to the original (rounding remainder).
10. Return after the product price changed (uses original invoice values).
11. Return of cash-sale item when drawer lacks cash (warn, allow, record).
12. Purchase return where some stock is already sold (rejected by on-hand/value rules).
13. Price change after cart open (cart price snapshot vs. current price — rule: price fixed at add-to-cart unless user refreshes; posting re-validates permission, not price).
14. Barcode scanned twice quickly (increment quantity vs. reject — configurable default: increment).
15. Cancel of an invoice whose items were since returned partially (blocked: cancel only if no returns, else return the rest).
16. Backdated purchase then sales after (costing in posting order).
17. Business day crossing midnight; DST shift in Africa/Cairo; PC clock moved backwards.
18. Product archived with stock on hand (cannot archive unless qty = 0 or Owner override).
19. Customer with credit limit exceeded mid-day; credit limit change on open debt.
20. Restore of an older backup (documents after the backup are lost — shown before confirmation; numbering continuity warning).
21. Two app instances started (second refused by single-instance lock + DB lock).
22. Disk full during posting (transaction fails cleanly; user told; no partial state).
23. Printer offline after posting (document stays posted; reprint queue).
24. Zero-quantity or zero-total documents (rejected except zero-price promotional lines with permission).
25. Very large numbers (BigInt path) and maximum representable invoice (boundary tests).
26. Owner attempts to sell more than on-hand ⇒ rejected, no side effects.
27. Second return attempt exceeding remaining returnable qty, or repeated refund with same `command_id` ⇒ rejected.
28. Return referencing a reversed invoice or no invoice ⇒ rejected.
29. Arabic-Indic digits typed into quantity/price fields ⇒ normalised to the same integer as Western digits.
30. Extra-cost allocation with non-divisible amount ⇒ Σ allocated equals the cost exactly; ties deterministic.

## 11. Explicitly out of v1 (not assumed)

Tax calculation (no VAT in the prototype, D-03)/ETA submission; negative stock and estimated-cost selling; automatic cash rounding; returns without original invoice; batch/expiry; multi-currency; landed-cost beyond the simple allocation in D-08; supplier price variance; returns without original; cheques/instalments; consignment; bundles/kits; discounts by promotion rules; loyalty.
