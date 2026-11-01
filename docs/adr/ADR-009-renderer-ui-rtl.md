# ADR-009 — Renderer stack, Arabic RTL and number display (W1-08 evidence)

Status: **Accepted for the items below** (2026-11-01). UI kit choice beyond these primitives stays open until Week 3.

## Decisions

| Topic | Decision | Reason |
|---|---|---|
| Framework | React 19 + TypeScript, built by electron-vite | Approved stack. |
| Styling | Plain CSS with custom properties and **logical properties only** (`margin-inline`, `padding-inline`, `inset-inline`, `text-align: start/end`) | RTL becomes native; no mirrored stylesheet to maintain. No UI kit adopted yet. |
| Font | **Cairo** (SIL OFL 1.1) bundled through `@fontsource/cairo` 5.3.0, Arabic and Latin subsets, weights 400/600/700, served from the app (CSP `font-src 'self'`) | Offline, licence permits bundling, covers Arabic and Latin. Production build is verified to contain the font and no external stylesheet URL. |
| Strings | A minimal typed dictionary `src/renderer/i18n/ar.ts` with `t('group.key')`; unknown keys fail the compiler; a test rejects any string without Arabic letters | v1 is Arabic-only; `i18next` adds weight and runtime failure modes with no v1 benefit. Revisit if a second language is approved. |
| Digits | Western digits (0-9) by default; Arabic-Indic (٠-٩) as a display option; input in any digit script is normalised to ASCII before parsing (`normalizeDigits`), stored values are integers | D-06. |
| Grouping | Thousands separator `,` (Western) or `٬` (Arabic-Indic); decimal `.` or `٫`. Display only: the parser accepts the Arabic grouping separator but intentionally rejects a typed Western `,` (ambiguous with a decimal comma). | Avoids silently mis-reading "1,5". |
| Mixed text | Amounts, codes, phone numbers and dates inside Arabic text are wrapped in `<bdi dir="ltr">` (`Money`, `Ltr` components). Plain-text outputs (receipts, exports) use Unicode isolates `U+2066 … U+2069` (`isolateLtr`). | Prevents digit and minus-sign reordering in RTL runs. |
| Numeric columns | Amount columns use `text-align: end` with tabular figures, so in RTL they align on the left edge and decimals line up; text columns use `start`. **Needs owner/pilot confirmation** that this reads naturally for Egyptian users. | Consistent alignment rule independent of direction. |
| Dates | Stored UTC; shown in `Africa/Cairo` as `DD/MM/YYYY HH:mm`; `business_date` stored as `YYYY-MM-DD`. The offset comes from the platform time-zone database, never hard-coded. | Egypt observes daylight saving; rules can change. |
| Keyboard | Roving tabindex grid: one Tab stop; arrow keys follow reading direction (in RTL, Left = next column); Home/End and Ctrl+Home/End. Radio group: one Tab stop. | Keyboard-complete POS (NFR-09). |
| Responsive | One column at or below 900 CSS px, two columns above (nav at the start side). Tables scroll inside their own container; the page never scrolls horizontally. | Small POS screens (1024×600) and zoomed Windows scaling. |
| Component gallery | Exists only in builds made with `VITE_GALLERY=1` (UI checks). `tools/verify-build.mjs` fails if the production bundle contains the gallery chunk or markup. | Test scaffolding must not ship. |

## Evidence (executed 2026-11-01)

- `tests/unit/format.test.ts` — formatting, grouping, isolates, Arabic-Indic, parse round-trips (5,000 random amounts), Cairo dates, UTC-late-night → next Cairo day, offsets +02:00 winter / +03:00 summer from the platform database, no skipped date across the April 2026 transition window, Arabic string dictionary.
- `tests/electron/ui.test.ts` — builds the gallery variant, runs it in a **real Electron window**, probes five viewports (1920×1080, 1366×768, 1366×768 at 125% zoom, 1024×600, 800×600) and drives the keyboard with real input events. All 12 assertions passed: `dir=rtl`, `lang=ar-EG`, Cairo loaded (Arabic and Latin), no horizontal page overflow, no clipped cells, ≥ 15 px table text, ≥ 44 px controls, amount/text alignment, `<bdi dir=ltr>` on LTR runs, 2-column vs 1-column switch, nav on the right at wide sizes, Tab order, grid arrow keys, Arabic-Indic input normalisation, same invoice total in both digit styles.
- Screenshots reviewed by eye: [docs/visual/w1-08/](../visual/w1-08/). Findings from review: Arabic-Indic glyphs render correctly in Cairo; mixed Arabic/Latin product names read in the right order; focus ring is visible on the grid cell.

## Limits (not proven)

- Screenshots are for human review; there is no pixel-diff regression test yet.
- Not tested: Windows display scaling above 125%, 1280×720 touch screens, IME composition in Arabic text fields, screen readers (axe-core and NVDA planned for Week 13).
- Only Cairo was evaluated; Tajawal and system fonts were not compared.
- The gallery sample data is synthetic. Real receipt width and wrapping belong to the printing spike (W1-09).
- The check relies on a visible desktop session. The CI step `pnpm test:ui` has not yet run on a GitHub runner.
- The time-zone assertions read the platform database; if Egypt's rules change, tests assert the old rule until the runtime is updated.
