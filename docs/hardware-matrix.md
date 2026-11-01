# Hardware compatibility matrix

Status: **BLOCKED.** No physical device is available. Nothing below has been tested on real hardware.
Supported models: **none** verified.

Software mocks (`src/infrastructure/hardware/mocks.ts`) test how HESBAN code behaves when a device reports a state or fails. They prove nothing about any printer, scanner or drawer. A device is listed as supported only after every case in its checklist is executed on that device and the result is written here with the date, model, firmware and Windows version.

## Devices needed (ADR-011)

| # | Device | Needed for | Status |
|---|---|---|---|
| 1 | 80 mm USB thermal receipt printer (model used by the pilot shop) | Arabic receipt, cut, drawer pulse | BLOCKED |
| 2 | 58 mm USB thermal receipt printer | Narrow receipt | BLOCKED |
| 3 | USB keyboard-wedge barcode scanner, 1D (two different models) | Scan timing, layout independence | BLOCKED |
| 4 | RJ11 cash drawer connected through the printer | Open pulse | BLOCKED |
| 5 | Windows 11 x64 retail PC (low-end spec) | Everything, plus performance | BLOCKED |

## Printer checklist (per model, per paper width)

| Case | Expected | Result |
|---|---|---|
| Print the Arabic sample receipt through the Windows driver (silent) | Letters joined, right-to-left, no truncated lines | BLOCKED |
| Amounts with minus sign and Arabic-Indic digits | Digits in the correct order | BLOCKED |
| Very long product name wraps | No clipping at either edge | BLOCKED |
| 100-line receipt | No page break inside a line; cut after last line | BLOCKED |
| Paper out, cover open, printer off, cable removed | Status detected or error mapped to a HardwareError code; no hang | BLOCKED |
| Power-cycle during print | Reprint marked "نسخة"; no duplicate invoice | BLOCKED |
| Print speed, 20-line receipt | Measured and recorded | BLOCKED |
| Raster fallback if driver shaping is wrong | Decision recorded | BLOCKED |

## Cash drawer checklist

| Case | Expected | Result |
|---|---|---|
| Open pulse after a cash sale | Drawer opens once | BLOCKED |
| Drawer cable unplugged | Sale unaffected; error reported | BLOCKED |

## Scanner checklist (per model)

| Case | Expected | Result |
|---|---|---|
| Scan EAN-13, EAN-8, UPC-A, Code 128 with the Windows layout set to Arabic | Barcode decoded correctly | BLOCKED |
| Measure real inter-key gaps | Decoder threshold (35 ms) confirmed or adjusted | BLOCKED |
| Scanner suffix Enter vs Tab | Both terminate a scan | BLOCKED |
| Double scan of the same item | Behaviour follows business rule (increment) | BLOCKED |
| Scan while a text field has focus | Not entered into the field unintentionally | BLOCKED |

## Result log

No entries.
