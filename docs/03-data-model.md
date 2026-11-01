# HESBAN — Database Entity Model (v1 proposal)

Status: APPROVED WITH CONDITIONS (see [decisions.md](decisions.md)) · Revised: 2026-11-01 · Engine: SQLite/SQLCipher (WAL, `STRICT` tables)

## 1. Global conventions

- Money: `INTEGER` piastres (suffix `_pt`). Quantity: `INTEGER` thousandths (suffix `_milli`). No `REAL` for business values.
- Keys: `id INTEGER PRIMARY KEY`; business documents and parties also carry `uuid TEXT NOT NULL UNIQUE` (UUIDv7).
- Time: `*_at` = UTC ISO-8601 text; `business_date` = local Cairo date `YYYY-MM-DD` chosen by the open shift/day.
- Never hard-delete business rows. Master data uses `is_active`/`archived_at`. Ledger and posted-document tables are protected by triggers (`BEFORE UPDATE/DELETE → RAISE(ABORT)`), except explicitly listed status columns.
- PRAGMAs on every connection: `foreign_keys=ON`, `journal_mode=WAL`, `synchronous=FULL`, `busy_timeout=5000`, `trusted_schema=OFF`.
- Every table has `created_at`; mutable master tables also `updated_at`, `updated_by`.
- CHECK constraints encode invariants (non-negative amounts, enum values, qty sign vs direction).
- Derived/cached tables are marked **(derived)** and are rebuildable from ledgers by the integrity tool.

## 2. Entity groups and relationships

```
users ─< sessions(memory only)           roles(permissions in code)
users ─< audit_log (hash chain)
products >─ categories      products >─ units
products ─< product_barcodes            products ─< product_packagings
parties (customer/supplier flags)

purchase_invoices ─< purchase_invoice_lines >─ products
sales_invoices ─< sales_invoice_lines >─ products
sales_returns ─< sales_return_lines >─ sales_invoice_lines
purchase_returns ─< purchase_return_lines >─ purchase_invoice_lines
stock_adjustments ─< stock_adjustment_lines

stock_movements  (immutable ledger; references any of the above lines)
stock_balances   (derived: qty + value per product)

payments ─< payment_allocations >─ (sales_invoices | purchase_invoices | returns)
cash_shifts ─< cash_movements        expenses >─ expense_categories

accounts ─< journal_lines >─ journal_entries >─ (source document ref)
party_balances (derived)             invoice_balances (derived)

number_series, command_log, settings, license_state, backup_log, day_closes
```

## 3. Tables

### 3.1 System
| Table | Key columns | Notes |
|---|---|---|
| `app_meta` | key, value | schema_version, install_id (uuid), created_at. |
| `settings` | key, value_json, updated_by | Digit style (no negative-stock setting exists, D-02), receipt text, paper width, default printer, backup config. Typed access layer; no money here except defaults. |
| `schema_migrations` | version, name, checksum, applied_at | Checksum mismatch ⇒ refuse to start. |
| `command_log` | command_id (UNIQUE), command_type, actor_id, result_json, doc_ref, created_at | Idempotency. Immutable. |
| `audit_log` | id, at, actor_id, action, entity_type, entity_id, details_json, prev_hash, hash | Hash chain: `hash = SHA256(prev_hash ‖ canonical(row))`. Immutable. Chain head also stored in backups. |
| `license_state` | license_blob, verified_at, last_seen_at, status | Monotonic `last_seen_at` for clock-rollback detection. |
| `backup_log` | at, path, size, sha256, verified, trigger | Informational. |

### 3.2 Identity
| Table | Key columns | Notes |
|---|---|---|
| `users` | id, username UNIQUE, display_name, role (`owner`,`manager`,`cashier`), password_hash, pin_hash NULL, failed_attempts, locked_until, is_active, must_change_password | Hash = scrypt/Argon2id with per-user salt and parameters stored in the hash string. At least one active owner enforced in code and trigger. |

Permissions are a static map role→permission set in code (`domain/permissions.ts`), versioned with the app. v1 has no per-user overrides.

### 3.3 Catalog
| Table | Key columns | Notes |
|---|---|---|
| `units` | id, name_ar, symbol, allows_fraction | Seeded; qty precision fixed at 3 decimals. Unit of a product cannot change after any movement. |
| `categories` | id, name_ar, is_active | One level. |
| `products` | id, uuid, sku UNIQUE NULL, name_ar, name_alt, category_id, unit_id, sale_price_pt, wholesale_price_pt NULL, min_stock_milli, is_active, tax_class NULL (reserved), created/updated | No cost fields here; cost lives in `stock_balances` + movements. Archive instead of delete. |
| `product_barcodes` | id, product_id, barcode UNIQUE, packaging_id NULL | Unique across the system; trimmed, validated charset. |
| `product_packagings` | id, product_id, name_ar, factor_milli, sale_price_pt NULL | e.g. carton = 12 base units. Movements are always stored in base units. |
| `parties` | id, uuid, name, phone, address, notes, is_customer, is_supplier, credit_limit_pt NULL, price_tier (`retail`,`wholesale`), opening_balance_pt, is_active | Balance sign convention below. Walk-in customer is *not* a party row; credit sales require a party. |
| `payment_methods` | id, code (`cash`,`electronic`), name_ar, ledger_account_id | Seeded. v1: cash and one generic electronic method. |
| `expense_categories` | id, name_ar, account_id | Each category maps to an expense account. |

### 3.4 Purchasing
| Table | Key columns |
|---|---|
| `purchase_invoices` | id, uuid, series, number, supplier_id, status (`draft`,`posted`,`reversed`), business_date, posted_at, supplier_ref, subtotal_pt, discount_pt, extra_costs_pt, total_pt, command_id, posted_by, reversed_by_id NULL, reverse_reason NULL |
| `purchase_invoice_lines` | id, invoice_id, line_no, product_id, qty_milli, line_total_pt (authoritative), unit_cost_pt (derived, display), allocated_discount_pt, allocated_extra_pt, inventory_value_pt (final value added to stock) |
| `purchase_returns` / `_lines` | return header; each line references `purchase_invoice_line_id`, qty_milli, value_pt (cost returned) |

`purchase_invoice_extra_costs` (D-08): id, invoice_id, description, amount_pt, is_capitalized, payee (`supplier`,`other`), allocation stored per line in `allocated_extra_pt`. Eligible (capitalized) costs are allocated by net line value with deterministic remainder.

Draft rows may be updated/deleted; the trigger allows mutations only while `status='draft'`.

### 3.5 Sales
| Table | Key columns |
|---|---|
| `sales_invoices` | id, uuid, series, number, customer_id NULL, status, business_date, posted_at, shift_id, cashier_id, subtotal_pt, discount_pt, total_pt, cogs_pt, command_id UNIQUE, price_tier, snapshot_json (canonical document copy for printing/ETA), reversed_by_id, reverse_reason |
| `sales_invoice_lines` | id, invoice_id, line_no, product_id, product_name_snapshot, unit_price_pt, qty_milli, line_discount_pt, allocated_invoice_discount_pt, line_total_pt, cogs_pt, price_override_by NULL, below_cost_flag |
| `sales_returns` / `_lines` | header with refund_method; line references `sales_invoice_line_id`, qty_milli, refund_pt, restored_cost_pt |
| `held_carts` | id, cashier_id, payload_json, created_at — non-financial; deletable |

### 3.6 Inventory
| Table | Key columns | Notes |
|---|---|---|
| `stock_movements` | id, seq (monotonic), product_id, movement_type (`purchase`,`sale`,`sale_return`,`purchase_return`,`adjustment`,`opening`,`reversal`), qty_delta_milli (signed), value_delta_pt (signed), qty_after_milli, value_after_pt, source_type, source_id, source_line_id, occurred_at, business_date | **Immutable ledger.** `qty_after`/`value_after` snapshot makes costing replay-verifiable. |
| `stock_balances` **(derived)** | product_id PK, qty_milli, value_pt, last_seq | Updated only in the posting transaction; CHECK `qty=0 ⇒ value=0`; CHECK `qty_milli >= 0` and `value_pt >= 0` unconditionally for every role (D-02). |
| `stock_adjustments` / `_lines` | reason (`damage`,`loss`,`found`,`count`,`other`), notes, status, posted_by |
| `stocktakes` / `_lines` (Should) | session, counted_qty, system_qty, variance, resulting adjustment id |

### 3.7 Payments and balances
| Table | Key columns | Notes |
|---|---|---|
| `payments` | id, uuid, direction (`in`,`out`), party_id NULL, method_id, amount_pt, business_date, shift_id, purpose (`invoice`,`on_account`,`refund`), source_doc_type/id NULL, command_id, status, reversed_by_id | Every cash/electronic movement of money with a party goes through here — including the paid-at-sale portion. |
| `payment_allocations` | payment_id, doc_type, doc_id, amount_pt | Sum of allocations ≤ payment amount; remainder = party credit. |
| `invoice_balances` **(derived)** | doc_type, doc_id, total_pt, allocated_pt, returned_pt, outstanding_pt | Rebuildable view/table. |
| `party_balances` **(derived)** | party_id, receivable_pt, payable_pt | Must equal journal AR/AP subledger. |

Sign convention: customer balance > 0 = customer owes us; supplier balance > 0 = we owe supplier. A negative balance is a credit in the other direction and is displayed as such ("رصيد دائن").

### 3.8 Cash
| Table | Key columns |
|---|---|
| `cash_shifts` | id, cashier_id, opened_at, closed_at NULL, business_date, opening_float_pt, expected_pt (computed at close), counted_pt, over_short_pt, status |
| `cash_movements` | id, shift_id, type (`sale`,`receipt`,`supplier_payment`,`expense`,`cash_in`,`cash_out`,`owner_draw`,`owner_capital`,`return_refund`,`float`), amount_pt (signed), ref_type/ref_id, reason, created_at — immutable |
| `expenses` | id, category_id, amount_pt, paid_from (`drawer`,`other`), shift_id NULL, business_date, notes, status, reversed_by_id |
| `day_closes` | business_date PK, closed_at, closed_by, z_snapshot_json — after close, no posting into that date |

### 3.9 Accounting
| Table | Key columns | Notes |
|---|---|---|
| `accounts` | id, code UNIQUE, name_ar, type (`asset`,`liability`,`equity`,`revenue`,`expense`,`contra`), normal_side, is_system | Seeded fixed chart (see business rules §6). No user edits in v1. |
| `journal_entries` | id, seq, entry_date (business_date), posted_at, source_type, source_id, memo, reverses_entry_id NULL | Immutable. |
| `journal_lines` | id, entry_id, account_id, debit_pt, credit_pt, party_id NULL, product_id NULL | CHECK exactly one of debit/credit > 0. Trigger-checked: Σdebit = Σcredit per entry at insert-batch time (also asserted in code). |

### 3.10 Numbering
`number_series`: series (`SI`,`SR`,`PI`,`PR`,`RC`,`PY`,`ADJ`,`EXP`), prefix, next_number, padding. Updated only inside posting transactions.

## 4. Index plan (initial)
- `product_barcodes(barcode)` UNIQUE; `products(name_ar)` plus an FTS5 virtual table for fast Arabic search (with normalisation: strip diacritics/tatweel, unify أ/إ/آ/ا, ى/ي, ة/ه as an *additional normalised search column*, original preserved).
- `stock_movements(product_id, seq)`; `(source_type, source_id)`.
- `sales_invoices(business_date)`, `(customer_id, status)`, `(number)`; lines `(invoice_id)`, `(product_id)`.
- `payments(party_id, business_date)`; `payment_allocations(doc_type, doc_id)`.
- `journal_lines(account_id, entry_id)`, `(party_id)`.
- `audit_log(at)`, `(entity_type, entity_id)`.

## 5. Triggers (immutability and integrity)
1. `trg_*_no_update/no_delete` on `stock_movements`, `journal_entries`, `journal_lines`, `audit_log`, `cash_movements`, `command_log`.
2. Posted-document triggers: allow only changes to `status` (`posted → reversed`), `reversed_by_id`, `reverse_reason`; everything else ABORT.
3. `users`: refuse deactivating/demoting the last active owner.
4. `product_barcodes`/`products.unit_id`: refuse unit change if any movement exists.
5. Posting into a closed `business_date` is rejected by a trigger on `journal_entries` (belt and braces with application check).
6. Returns: a trigger on `sales_return_lines` rejects `Σ returned qty > original line qty` (reversed returns excluded) and `Σ refund > original line total`; `sales_returns.original_invoice_id` is NOT NULL (D-12).
7. `stock_balances` CHECKs reject negative qty/value; a sale line insert that would cause it aborts the transaction (D-02).

## 6. Reserved for later (do not create tables yet)
`external_submissions` (ETA outbox), tax lines, multi-branch `store_id`, sync metadata. Columns reserved: `tax_class`, `snapshot_json`, `uuid`.

## 7. Migration policy
- Numbered forward-only SQL files; each in one transaction; checksum stored.
- Before any migration: automatic verified backup. After: invariant checker.
- CI replays migrations from every released schema version on fixture databases with data.
