# HESBAN — Approved Decisions (Architecture Decisions Approval v1.0)

Status: APPROVED WITH CONDITIONS · Recorded 2026-11-01 · Supersedes the recommendations in earlier drafts wherever they differ.

| ID | Result | Final instruction | Affects |
|---|---|---|---|
| D-01 | Approved | Internal double-entry accounting, fixed chart of accounts, balanced journal entries, immutable posting. Discounts recorded separately (account 4150) for audit; reports show net revenue. | ADR-006, doc 03, 04 |
| D-02 | Changed | Negative stock completely blocked in V1, including Owner. No estimated-cost selling. No setting to enable it. | ADR-016, doc 01, 03, 04, 06 |
| D-03 | Changed | No VAT calculation in the initial prototype. Tax fields and architecture reserved. Each pilot shop's Egyptian tax and ETA obligations must be checked before any real-world invoicing. | ADR-013, ADR-017 |
| D-04 | Approved | Weighted-average costing by posting sequence; no retroactive recosting; backdating restricted; closed periods locked. | ADR-007, doc 04 |
| D-05 | Approved | Wholesale prices, packaging units, conversion factors and SKU/barcode mapping in the initial schema. UI incremental. | doc 03, 01 |
| D-06 | Approved | Western digits default; Arabic-Indic display option; all stored numeric values normalised. | ADR-009, doc 04 |
| D-07 | Approved | One active cash drawer/shift per register. Opening balance, closing count, reconciliation and audit history required. | doc 04 §7 |
| D-08 | Approved | Eligible additional purchase costs allocated proportionally by net line value, deterministic remainder allocation. | doc 04 §5.1 |
| D-09 | Changed | Investigate code signing and distribution immediately; choose a workable method before release preparation. | ADR-014, Week 1 |
| D-10 | Changed | Windows 11 x64 primary. Windows 10 only after confirming security-update eligibility, Electron compatibility and real customer hardware. No Windows 7/8. | ADR-019, doc 01 NFR-08 |
| D-11 | Approved | No automatic cash rounding. Exact monetary calculations, explicit rounding rules. | doc 04 §2 |
| D-12 | Approved | Returns require an original posted invoice; enforce remaining returnable quantity; prevent duplicate refunds. | doc 04 §5.3 |

## Additional decisions

- **ADR-002 SQLCipher:** conditionally approved. Test encryption, key management, backup, restore, migration, performance. No hardcoded keys. If SQLCipher fails: evaluate alternatives and document security risk before any unencrypted fallback. Encrypted backups mandatory regardless.
- **Accountant review:** a qualified Egyptian accountant validates purchasing, inventory valuation, sales, partial payments, returns, discounts, rounding and journal mappings **before Week 4**. Posting code does not start until done (hard gate).
- **Shadow-mode pilot:** starts around Weeks 11–12. Compare HESBAN with the shop's existing system. HESBAN is **not** the sole financial record during shadow mode. A 30-day shadow test does not replace production acceptance. Release only after financial, security and recovery criteria pass.
- **Hardware:** test real Egyptian retail hardware early (thermal printer with Arabic, USB scanner, cash drawer, Windows 11 retail PC). Record supported models in `docs/hardware-matrix.md`.

## Mandatory engineering rules (binding)

1. Integer piastres, integer thousandths, BigInt-safe intermediates.
2. Exact historical COGS and inventory valuation.
3. Atomic transactions and idempotency keys.
4. Balanced journals; auditable stock movements.
5. Posted documents immutable; reversal/correction documents.
6. RBAC enforced in business services, not only UI.
7. Secure IPC, context isolation, strict input validation.
8. No plaintext passwords; no payment-card data stored.
9. Tested backup and restore, including recovery on a replacement PC.
10. Never delete customer data or block its export because a license expires.
11. Prevent unauthorised modification; in-app-immutable audit records.
12. No unsupported tax-compliance claims.
13. Mandatory automated unit, integration, security and financial-invariant tests.
14. No production release with unresolved critical financial, security or data-loss defects.

## Scope and schedule

Egypt only · EGP · Windows desktop · offline-first modular monolith · single device/register. 16 weeks subject to release gates; re-estimate at Weeks 4 and 8; cut optional features before reducing accounting, security or recovery testing.

## Conflict review (documents vs approvals) — resolved 2026-11-01

| # | Conflict found | Resolution |
|---|---|---|
| 1 | Rules §4 and README allowed owner-enabled negative stock | Removed; stock never negative for any role; setting removed from PRD SET-01 and data model `settings`; CHECK constraint unconditional. |
| 2 | Rules §5.2 presented sales net of discount | Journal now credits gross revenue (4100) and debits discounts (4150); net revenue in reports. Chart of accounts gained 4150. |
| 3 | Rules §5.3 allowed an Owner "manual stock-in + cash-out" workaround for returns without invoice | Removed; no refund without a posted original invoice. |
| 4 | PRD NFR-08, testing §9, README listed Windows 10 as equal target | Windows 11 primary; Windows 10 conditional on D-10 checks. |
| 5 | Testing §10 item 8 and roadmap Week 15/16 treated a 30-day pilot as acceptance | Rewritten: shadow mode is comparison only; release gates are separate and not waived. |
| 6 | Architecture ADR-002 allowed plain-SQLite fallback by default | Now conditional with documented-risk review and owner decision. |
| 7 | Week 1 had no signing or accountant task; used Windows 10/11 | Added W1-12, W1-13; Windows 11 primary; hours rebalanced to 60. |
| 8 | PRD CAT-04/SAL-09 implied late schema | Schema for packaging/wholesale in first migration; only UI incremental. |
| 9 | Rules lacked deterministic extra-cost allocation | Added to §5.1. |
| 10 | D-06 normalisation unspecified | Input digit normalisation rule added (rules §2). |

Open items remaining (2026-11-01): accountant sign-off (PENDING), signing method, owner acceptance of the SQLCipher spike limits (spike itself is done, see adr/ADR-002-sqlcipher-spike.md), Windows 10 eligibility, pilot-shop tax/ETA obligations, hardware models (physical testing BLOCKED).
