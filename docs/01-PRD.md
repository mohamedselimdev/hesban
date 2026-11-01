# HESBAN (حِسبان) — Product Requirements Document v1.0

Status: APPROVED WITH CONDITIONS (see [decisions.md](decisions.md)) · Revised: 2026-11-01 · Owner: Mohamed Selim

---

## 1. Vision

HESBAN is an offline-first Windows desktop application that lets a small Egyptian retail shop sell fast, know exactly what is in stock, know who owes whom, and close the cash drawer correctly every day — with numbers the owner can trust.

Positioning: not a feature-heavy ERP. A reliable, Arabic-first cash-register-plus-ledger that never loses or silently alters a financial record.

## 2. Target users

| Persona | Description | Needs |
|---|---|---|
| Owner (صاحب المحل) | Often also the cashier or the buyer. Moderate computer skill. | Daily profit, stock value, customer debts, supplier debts, cash reconciliation, protection from employee theft. |
| Manager (مدير) | Trusted employee. | Purchasing, stock adjustments, returns approval, reports. |
| Cashier (كاشير) | High turnover, low training time. | Very fast barcode sale, simple payment, receipt printing. Cannot see costs or profit. |

Target businesses: grocery/supermarket (بقالة/سوبر ماركت), stationery, mobile accessories, cosmetics, small pharmacies' non-regulated goods (no drug regulation features in v1), clothing without size/colour matrix, general trade. One shop, one Windows PC, 1–3 users (sequential use, not concurrent).

## 3. Goals and non-goals

### Goals (v1)
1. Every financial and stock effect is correct, traceable, atomic and reversible only by explicit counter-documents.
2. Sale of a scanned item in under 2 seconds end-to-end (scan → line visible), full invoice finish in under 10 seconds for a 5-item basket.
3. Works fully offline; data survives power loss.
4. Arabic RTL UI that a shop assistant understands without training manual.
5. Recoverable: encrypted backups, tested restore, full export at any time even with an expired license.

### Non-goals (v1) — changing these requires explicit approval
- Multi-device sync, multi-branch, client/server mode, cloud, mobile apps, web portal.
- AI chatbot or AI features.
- Full ETA e-invoice / e-receipt integration (design hooks only; no compliance claim).
- Manufacturing, recipes, restaurants/tables/kitchen, delivery, loyalty/points, e-commerce.
- Cheques, instalments, multi-currency, user-defined chart of accounts, payroll, fixed assets.
- Batch/expiry/serial tracking, size/colour variants.
- Barcode label designer (internal barcode generation only, if approved — see Open Decisions).

## 4. Scope and priority

Priority: **M** Must (release blocker), **S** Should (cut if schedule slips, in the order given in the roadmap), **C** Could (only if time remains).

### 4.1 Functional requirements

**Authentication and access (AUTH)**
- AUTH-01 M Local users with name, role, active flag; password hashed with a memory-hard KDF; no plaintext secrets stored.
- AUTH-02 M Roles Owner / Manager / Cashier with a fixed permission matrix (see §6 of the threat model and business rules); every protected command checks permission in the main process.
- AUTH-03 M Cashier quick-switch by PIN with lockout/throttling after repeated failures.
- AUTH-04 M First-run wizard creates the Owner and a printed/saved recovery key. No hidden backdoor password.
- AUTH-05 S Auto-lock after configurable idle time.

**Catalog (CAT)**
- CAT-01 M Products: Arabic name, optional second name, SKU, category, base unit, retail price, optional wholesale price, min stock level, active/archived. Products are never hard-deleted once used.
- CAT-02 M Multiple barcodes per product; unique across the system.
- CAT-03 M Units: piece, kg, g, litre, metre, etc.; quantity precision 3 decimals; piece-type units reject fractions.
- CAT-04 S Packaging units (e.g. carton = 12 pieces) with own barcode/price and a conversion factor to the base unit. Schema, wholesale price and SKU/barcode mapping are in the initial migration (D-05); UI is incremental.
- CAT-05 M Categories (one level in v1).
- CAT-06 M Customers and suppliers as "parties" (a party can be both): name, phone, address, notes, credit limit (customers), opening balance.
- CAT-07 S CSV import for products and parties with a dry-run validation report.

**Purchasing (PUR)**
- PUR-01 M Purchase invoice from a supplier: lines (product, qty, line cost), invoice discount, paid amount (partial payment allowed), supplier invoice reference.
- PUR-02 M Posting increases stock and recomputes weighted-average cost.
- PUR-03 M Purchase return linked to the original invoice line.
- PUR-04 S Additional invoice costs (transport, etc.) allocated into inventory cost — approved D-08: proportional to net line value, deterministic remainder.
- PUR-05 M Draft purchase invoices can be saved and resumed; drafts are not financial records.

**Sales and POS (SAL)**
- SAL-01 M POS screen: barcode scan, search by name/code, quantity edit, line discount, invoice discount (permissioned), hold/resume carts.
- SAL-02 M Payment: cash, other electronic (card machine / wallet, recorded as a method only), mixed, credit (customer required), partial payment, change calculation.
- SAL-03 M Posting produces an immutable invoice, a gapless invoice number, stock movements at weighted-average cost, COGS, and journal entries in one atomic transaction.
- SAL-04 M Selling below cost, selling at price 0, and overriding price are permissioned and audited.
- SAL-05 M Selling more than on-hand stock is blocked for every role including Owner. No setting, no estimated-cost selling (D-02).
- SAL-06 M Sales return linked to original invoice, restoring stock at the original sale cost.
- SAL-07 M Cancel (reverse) a posted invoice with reason, permission and audit; original is never deleted.
- SAL-08 M Idempotent submit: a double click or retry can never create two invoices.
- SAL-09 S Wholesale price tier selectable per customer.

**Payments and balances (PAY)**
- PAY-01 M Receive payment from customer; pay supplier; allocate to specific invoices or oldest-first; unallocated amount becomes party credit.
- PAY-02 M Customer and supplier statement (كشف حساب) with running balance, printable.
- PAY-03 M Receivables and payables aging report.
- PAY-04 M Opening balances for parties at go-live.

**Inventory (INV)**
- INV-01 M Immutable stock-movement ledger; on-hand quantity and value are derived and verifiable.
- INV-02 M Stock adjustment documents (increase/decrease with reason and permission).
- INV-03 M Opening stock entry at go-live.
- INV-04 S Stocktake session: count, review variance, post adjustment.
- INV-05 M Low-stock list.
- INV-06 M Inventory valuation report at weighted-average cost.

**Cash management (CSH)**
- CSH-01 M Cash shift (drawer session): opening float, cash sales/receipts, cash in/out, expenses, closing count, reconciliation, over/short recorded, audit history; one active shift per register (D-07).
- CSH-02 M Expense entry with category, paid from drawer or other source.
- CSH-03 M Owner drawings / capital injection as cash movements.
- CSH-04 M Business-day close producing a Z-report and locking the date.

**Reporting and export (RPT)**
- RPT-01 M Sales by day/product/category/cashier; profit (gross) by period/product.
- RPT-02 M Cash/shift report, expenses report.
- RPT-03 M Inventory valuation, low stock, stock movement history per product.
- RPT-04 M Export any report and any master/transaction table to CSV/XLSX.
- RPT-05 M Full data export (all business data, open format) available in every license state.

**Printing and hardware (PRN)**
- PRN-01 M 80 mm and 58 mm thermal receipt with correct Arabic shaping and RTL; reprint marked as copy.
- PRN-02 M USB keyboard-wedge barcode scanner support, independent of the active keyboard layout.
- PRN-03 S Cash-drawer kick via the printer.
- PRN-04 S A4 invoice / statement PDF.
- PRN-05 C Internal barcode generation and label print.

**Backup and recovery (BAK)**
- BAK-01 M Automatic encrypted local backup (on close of day and on schedule) to a user-chosen folder, with integrity verification after write.
- BAK-02 M Manual backup to external drive.
- BAK-03 M Restore wizard that verifies the file, shows what will be lost, snapshots the current DB first, and runs the integrity checker afterwards.
- BAK-04 M Integrity check tool (stock = ledger, journal balanced, receivables = sum of invoices, etc.).

**Licensing (LIC)**
- LIC-01 M Offline-verifiable signed license file bound to the installation; plan and dates are data, not constants.
- LIC-02 M Expired license ⇒ read-only mode: view, report, export, backup, restore remain available; new sales/purchases blocked after a configurable grace period.
- LIC-03 M Clock-rollback detection (best effort, documented as deterrent not security).

**Audit and settings (AUD / SET)**
- AUD-01 M Tamper-evident audit log of security and financial actions (login, failures, permission changes, price overrides, cancellations, adjustments, backup/restore, license events).
- SET-01 M Shop name/address/phone/tax-registration-number fields, receipt header/footer, digit style (Western/Arabic-Indic), paper width, default printer, backup configuration.
- I18N-01 M Western digits by default, Arabic-Indic display option; digits entered in any script are normalised before storage (D-06). All UI strings externalised; v1 ships Arabic only; dates in Africa/Cairo.

### 4.2 Egypt-specific rules to respect
- Currency EGP, piastre precision 2. All money stored as integer piastres.
- Business date vs wall-clock: shops trade past midnight; every document has a `business_date` set from the open shift/day.
- Africa/Cairo observes daylight saving time; timestamps are stored in UTC and rendered in Cairo local time.
- VAT/ETA: v1 does **not** compute or submit tax. The data model reserves tax fields and an immutable document snapshot. Compliance statements are forbidden until implemented and verified against the current ETA documentation (see D-03).

## 5. Non-functional requirements

| ID | Requirement | Target (measured in CI/benchmarks, not assumed) |
|---|---|---|
| NFR-01 | Durability | Committed transaction survives power loss (SQLite WAL, `synchronous=FULL`). Crash-injection test in CI. |
| NFR-02 | Scan-to-line latency | p95 < 150 ms with 50,000 products on a low-end PC (Celeron/4 GB/HDD-class laptop). |
| NFR-03 | Post invoice | p95 < 300 ms for a 20-line invoice. |
| NFR-04 | Cold start | < 6 s on the reference low-end machine. |
| NFR-05 | Data volume | 50k products, 20k parties, 1M invoice lines without report timeouts (reports < 3 s for monthly range). |
| NFR-06 | Memory | < 400 MB resident at idle. |
| NFR-07 | Offline | No feature in the sell/buy/cash path requires internet. |
| NFR-08 | OS | Windows 11 x64 primary. Windows 10 only after confirming security-update eligibility, Electron compatibility and real customer hardware (D-10). Windows 7/8 unsupported. |
| NFR-09 | Accessibility | Keyboard-complete POS; minimum 14 px text in tables; contrast ≥ WCAG AA. |
| NFR-10 | Security | See threat model. |
| NFR-11 | Supportability | Local rotating logs, one-click diagnostics bundle (no secrets, no personal data). |

## 6. Business model (hypotheses — NOT application constants)

- Installation/setup: EGP 4,000 one-off.
- Subscription: EGP 250/month or EGP 600/year (the annual price is below 12 × monthly; the app must not assume any relationship).
- Implementation consequence: plans, prices and durations live only in the license file/vendor tooling; the app displays what the license says. Nothing in code or database schema hard-codes these figures.
- Support burden is a business risk: the cost of on-site help can erase margin at these prices; design for self-service (first-run wizard, import, restore) deliberately.

## 7. Success metrics (pilot)

- Zero integrity-check failures and zero unexplained differences versus the shop's existing records during shadow-mode testing (Weeks 11–12 onward). Shadow mode is evidence, not acceptance; release gates are in the testing strategy §10.
- Zero unrecoverable data-loss incidents; restore drill succeeds on a different PC.
- Cashier completes first sale unaided within 10 minutes of first training.
- Owner can answer "what is my stock worth / who owes me / what did I earn today" from the app without help.

## 8. Assumptions (to be validated with a pilot shop)

1. One shop, one PC, one active cashier at a time.
2. Most shops are not yet obligated to issue e-receipts; those that are will need a later release.
3. Prices are stored tax-exclusive/inclusive as entered; v1 treats the entered price as the final price and calculates no VAT. Each pilot shop's tax and ETA obligations must be checked before real-world invoicing (D-03).
4. Weighted-average costing is acceptable to Egyptian shop owners and their accountants.
5. Printers are 80 mm/58 mm USB thermal printers with Windows drivers.
6. Shops can provide an external drive or secondary folder for backups.

## 9. Top risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | 960 planned hours is not enough for the Must list | Late/ugly release | Cut order defined in roadmap; weekly burn-down; 15% buffer. |
| R2 | Arabic thermal printing differs per printer model | Unusable receipts | Week-1 hardware spike; raster-image fallback; supported-printer list. |
| R3 | Accounting mistakes in cost/returns/rounding | Loss of trust | Written rules, property tests, invariant checker shipped in-product. |
| R4 | Data loss (disk failure, user error) | Business-ending for the customer | Encrypted automatic backups, restore drills, off-device copy prompt. |
| R5 | Native module (SQLite) build/packaging pain on Windows | Schedule | Week-1 spike with exact toolchain pinned. |
| R6 | Licensing cracked or too strict | Revenue / angry customers | Treat as deterrent; never block data access; generous grace. |
| R7 | Code-signing certificate cost/time | SmartScreen warnings, AV false positives | Decide early (D-09). |
| R8 | Single-developer bus factor | Project risk | ADRs, dev log, tests as documentation. |
| R9 | Scope creep from pilot customers | Schedule | Written change-control; backlog parking lot. |

## 10. Open decisions requiring approval

Resolved 2026-11-01: see [decisions.md](decisions.md). Remaining gates: accountant review before Week 4 (PENDING), owner acceptance of SQLCipher spike limits, signing method, Windows 10 eligibility, hardware matrix (BLOCKED, no physical devices yet).
