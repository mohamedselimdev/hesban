import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  charForKey,
  createScanDecoder,
  isValidGtin,
  type KeyInput,
} from '../../src/application/hardware/scan-decoder';
import { openDrawer, printReceipt } from '../../src/application/hardware/print-service';
import { createWedgeScanner } from '../../src/application/hardware/wedge-scanner';
import { HardwareError } from '../../src/application/ports/hardware';
import { escapeHtml, renderReceiptHtml } from '../../src/application/receipt/html';
import { columnsFor, type ReceiptDocument } from '../../src/application/receipt/model';
import {
  displayWidth,
  renderReceiptText,
  sanitizeText,
  wrapText,
} from '../../src/application/receipt/text';
import { piastres } from '../../src/domain/money';
import { milli } from '../../src/domain/qty';
import { MockCashDrawer, MockPrinter, MockScanner } from '../../src/infrastructure/hardware/mocks';

function receipt(overrides: Partial<ReceiptDocument> = {}): ReceiptDocument {
  return {
    shopName: 'سوبر ماركت النور',
    shopAddress: '١٢ شارع التحرير، الدقي، الجيزة',
    shopPhone: '01012345678',
    documentLabel: 'فاتورة بيع',
    number: 'SI-000123',
    issuedAt: '2026-11-01T12:05:00Z',
    cashier: 'أحمد',
    customerName: undefined,
    lines: [
      {
        name: 'كابل USB-C طول 1 متر',
        qty: milli(2000),
        unitPrice: piastres(8550),
        total: piastres(17100),
      },
      {
        name: 'جبنة رومي (بالكيلو)',
        qty: milli(350),
        unitPrice: piastres(8550),
        total: piastres(2993),
      },
    ],
    discount: piastres(0),
    total: piastres(20093),
    paid: piastres(25000),
    change: piastres(4907),
    due: piastres(0),
    footer: undefined,
    isCopy: false,
    paperWidth: 80,
    digitStyle: 'western',
    ...overrides,
  };
}

describe('receipt text', () => {
  it('never exceeds the paper width, for both widths and both digit styles', () => {
    const long = receipt({
      shopName: 'مؤسسة الأمل الحديثة للتجارة العامة والمستلزمات المنزلية والأدوات الكهربائية',
      lines: [
        {
          name: 'مجموعة أدوات منزلية متكاملة مصنوعة من الستانلس ستيل عالي الجودة Premium-Kitchen-Set-XL-2026',
          qty: milli(12500),
          unitPrice: piastres(123456789),
          total: piastres(1543209862),
        },
      ],
      total: piastres(1543209862),
      paid: piastres(1543209862),
      change: piastres(0),
    });
    for (const paperWidth of [58, 80] as const) {
      for (const digitStyle of ['western', 'arabic-indic'] as const) {
        const lines = renderReceiptText({ ...long, paperWidth, digitStyle });
        for (const line of lines) {
          expect(displayWidth(line), `${paperWidth} ${digitStyle}: ${line}`).toBeLessThanOrEqual(
            columnsFor(paperWidth),
          );
        }
      }
    }
  });

  it('puts the total in the receipt, isolated so digits and minus keep their order', () => {
    const lines = renderReceiptText(receipt());
    const total = lines.find((l) => l.startsWith('الإجمالي'));
    expect(total).toContain('\u2066200.93\u2069');
    expect(lines.some((l) => l.includes('\u2066' + '25,000'.replace(',', '') + '.00'))).toBe(false);
    expect(lines.find((l) => l.startsWith('المدفوع'))).toContain('\u2066250.00\u2069');
    expect(lines.find((l) => l.startsWith('الباقي'))).toContain('\u206649.07\u2069');
  });

  it('shows Cairo local time, Arabic-Indic digits on request, and the copy marker on reprints', () => {
    const lines = renderReceiptText(receipt({ isCopy: true, digitStyle: 'arabic-indic' }));
    expect(lines[0]).toContain('نسخة');
    expect(lines.find((l) => l.startsWith('التاريخ'))).toContain('٠١/١١/٢٠٢٦ ١٤:٠٥');
    expect(renderReceiptText(receipt()).some((l) => l.includes('نسخة'))).toBe(false);
  });

  it('prints fractional quantities exactly (0.350 kg × 85.50 = 29.93)', () => {
    const lines = renderReceiptText(receipt());
    expect(lines.some((l) => l.includes('0.35 × 85.50') && l.includes('29.93'))).toBe(true);
  });

  it('measures Arabic by grapheme: diacritics and bidi marks take no column', () => {
    expect(displayWidth('محمد')).toBe(4);
    expect(displayWidth('مُحَمَّد')).toBe(4);
    expect(displayWidth('\u2066123\u2069')).toBe(3);
  });

  it('wraps at spaces and splits a long word only between grapheme clusters', () => {
    expect(wrapText('اللبن الطازج كامل الدسم', 10)).toEqual(['اللبن', 'الطازج', 'كامل الدسم']);
    const pieces = wrapText('أ'.repeat(25) + 'ب', 10);
    expect(pieces.map((p) => displayWidth(p))).toEqual([10, 10, 6]);
    const marked = wrapText('مُحَمَّدمُحَمَّدمُحَمَّد', 5);
    for (const piece of marked) expect(piece.startsWith('\u064e')).toBe(false);
  });

  it('removes control characters and bidi overrides from user text', () => {
    expect(sanitizeText('بند\u202eخطير\u2066\u0007\n  عادي')).toBe('بندخطير عادي');
    expect(sanitizeText('\u200bx\u200f')).toBe('x');
  });
});

describe('receipt html', () => {
  it('is right-to-left Arabic with the paper width in the page rules', () => {
    const html = renderReceiptHtml(receipt({ paperWidth: 58 }));
    expect(html).toContain('<html lang="ar-EG" dir="rtl">');
    expect(html).toContain('@page{size:58mm auto;margin:0}');
    expect(renderReceiptHtml(receipt({ paperWidth: 80 }))).toContain('size:80mm auto');
  });

  it('escapes hostile product names and never emits script, handlers or remote loads', () => {
    const hostile = receipt({
      shopName: '<script>alert(1)</script>',
      customerName: '"><img src=x onerror=alert(1)>',
      lines: [
        {
          name: "<b onmouseover='x'>سلعة</b>&amp;",
          qty: milli(1000),
          unitPrice: piastres(100),
          total: piastres(100),
        },
      ],
    });
    const html = renderReceiptHtml(hostile);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<b /i);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b onmouseover=&#39;x&#39;&gt;');
    expect(html).toContain('&amp;amp;');
    const body = html.slice(html.indexOf('<body>'));
    // Escaped text may still read "onerror="; what matters is that no real tag carries a handler.
    expect(body).not.toMatch(/<[^>]*\bon[a-z]+\s*=/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('carries a policy that forbids scripts and network', () => {
    const html = renderReceiptHtml(receipt());
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/script-src|connect-src/);
  });

  it('marks reprints as copies and prints the same amounts as the text version', () => {
    const html = renderReceiptHtml(receipt({ isCopy: true }));
    expect(html).toContain('*** نسخة ***');
    for (const amount of ['200.93', '250.00', '49.07', '171.00', '29.93']) {
      expect(html).toContain(`<bdi dir="ltr">${amount}</bdi>`);
    }
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

let t = 0;
function typeString(code: string[], gap: number, shift = false): KeyInput[] {
  return code.map((c) => ({ code: c, shiftKey: shift, timeStamp: (t += gap) }));
}
const digits = (s: string) => [...s].map((d) => `Digit${d}`);

function run(events: KeyInput[], options?: Parameters<typeof createScanDecoder>[0]) {
  const decoder = createScanDecoder(options);
  return events.map((e) => decoder.push(e)).filter((x): x is string => x !== null);
}

describe('barcode scan decoder', () => {
  it('decodes a fast digit run ended by Enter', () => {
    t = 1000;
    expect(run(typeString([...digits('6221234567890'), 'Enter'], 8))).toEqual(['6221234567890']);
  });

  it('ignores slow human typing even if it ends with Enter', () => {
    t = 5000;
    expect(run(typeString([...digits('6221234567890'), 'Enter'], 150))).toEqual([]);
  });

  it('decodes by physical key, so an Arabic keyboard layout cannot corrupt letters or digits', () => {
    // Under an Arabic layout the browser would report key: 'ش' for KeyA, but code stays KeyA.
    t = 9000;
    const events: KeyInput[] = [
      ...typeString(['ShiftLeft'], 5),
      ...typeString(['KeyA'], 5, true),
      ...typeString(['KeyB'], 5, true),
      ...typeString(['Minus'], 5),
      ...typeString(digits('0042'), 5),
      ...typeString(['Enter'], 5),
    ];
    expect(run(events)).toEqual(['AB-0042']);
  });

  it('ignores runs that are too short, too long, or contain non-barcode keys', () => {
    t = 20000;
    expect(run(typeString([...digits('123'), 'Enter'], 5))).toEqual([]);
    expect(run(typeString([...digits('1234'), 'Enter'], 5))).toEqual(['1234']);
    expect(
      run(typeString([...digits('12'), 'KeyZ', 'Escape', ...digits('34'), 'Enter'], 5)),
    ).toEqual([]);
    const tooLong = typeString([...digits('1'.repeat(60)), 'Enter'], 3);
    expect(run(tooLong)).toEqual([]);
  });

  it('starts a new scan after a pause and drops the stale partial input', () => {
    t = 40000;
    const events = [
      ...typeString(digits('99'), 5),
      ...typeString([...digits('6221111111111'), 'Enter'], 5).map((e, i) =>
        i === 0 ? { ...e, timeStamp: e.timeStamp + 500 } : e,
      ),
    ];
    // Only the keys after the pause count.
    const shifted = events.map((e, i) => (i > 2 ? { ...e, timeStamp: e.timeStamp + 500 } : e));
    expect(run(shifted)).toEqual(['6221111111111']);
  });

  it('decodes two scans back to back', () => {
    t = 70000;
    const events = [
      ...typeString([...digits('11111111'), 'Enter'], 5),
      ...typeString([...digits('22222222'), 'NumpadEnter'], 5),
    ];
    expect(run(events)).toEqual(['11111111', '22222222']);
  });

  it('treats shortcuts as not-a-scan and resets', () => {
    t = 90000;
    const events = [
      ...typeString(digits('1234'), 5),
      { code: 'KeyV', shiftKey: false, ctrlKey: true, timeStamp: (t += 5) },
      ...typeString(['Enter'], 5),
    ];
    expect(run(events)).toEqual([]);
  });

  it('maps keys and validates GTIN check digits', () => {
    expect(charForKey('Numpad7', false)).toBe('7');
    expect(charForKey('KeyQ', true)).toBe('Q');
    expect(charForKey('Slash', false)).toBe('/');
    expect(charForKey('F5', false)).toBeNull();
    expect(isValidGtin('6221234567893')).toBe(false);
    expect(isValidGtin('4006381333931')).toBe(true);
    expect(isValidGtin('036000291452')).toBe(true);
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('12345')).toBe(false);
    expect(isValidGtin('40063813339a1')).toBe(false);
  });
});

describe('wedge scanner (key source → scans)', () => {
  it('emits scans to subscribers and unsubscribes cleanly', () => {
    const handlers = new Set<(e: KeyInput) => void>();
    let subscriptions = 0;
    const source = {
      subscribe: (h: (e: KeyInput) => void) => {
        subscriptions++;
        handlers.add(h);
        return () => handlers.delete(h);
      },
    };
    const scanner = createWedgeScanner(source);
    expect(scanner.descriptor.isMock).toBe(false);
    expect(scanner.descriptor.verifiedOnPhysicalHardware).toBe(false);
    const seen: string[] = [];
    const off = scanner.onScan((b) => seen.push(b));
    const second: string[] = [];
    const off2 = scanner.onScan((b) => second.push(b));
    expect(subscriptions).toBe(1);

    t = 120000;
    for (const e of typeString([...digits('6221234567890'), 'Enter'], 6)) {
      handlers.forEach((h) => h(e));
    }
    expect(seen).toEqual(['6221234567890']);
    expect(second).toEqual(['6221234567890']);

    off();
    off2();
    expect(handlers.size).toBe(0);
  });
});

describe('printing with a mock printer', () => {
  const noDelay = () => Promise.resolve();

  it('prints once on success and sends rendered html for the right paper width', async () => {
    const printer = new MockPrinter();
    const outcome = await printReceipt(printer, receipt({ paperWidth: 58 }), { delay: noDelay });
    expect(outcome).toEqual({ ok: true, attempts: 1 });
    expect(printer.jobs).toHaveLength(1);
    expect(printer.jobs[0]?.paperWidth).toBe(58);
    expect(printer.jobs[0]?.jobName).toBe('receipt-SI-000123');
    expect(printer.jobs[0]?.html).toContain('size:58mm');
  });

  it('reports paper-out, cover-open and offline without attempting to print or throwing', async () => {
    const cases = [
      [{ online: true, paperOut: true, coverOpen: false }, 'PAPER_OUT'],
      [{ online: true, paperOut: false, coverOpen: true }, 'COVER_OPEN'],
      [{ online: false, paperOut: false, coverOpen: false }, 'NOT_CONNECTED'],
    ] as const;
    for (const [status, code] of cases) {
      const printer = new MockPrinter();
      printer.statusValue = status;
      const outcome = await printReceipt(printer, receipt(), { delay: noDelay });
      expect(outcome).toEqual({ ok: false, code, attempts: 1, reprintable: true });
      expect(printer.printCalls).toBe(0);
    }
  });

  it('retries a timeout once and then succeeds', async () => {
    const printer = new MockPrinter();
    printer.printFailures.push(new HardwareError('TIMEOUT'));
    const delays: number[] = [];
    const outcome = await printReceipt(printer, receipt(), {
      delay: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    expect(outcome).toEqual({ ok: true, attempts: 2 });
    expect(delays).toEqual([300]);
    expect(printer.jobs).toHaveLength(1);
  });

  it('stops retrying after the limit and keeps the document reprintable', async () => {
    const printer = new MockPrinter();
    printer.printFailures.push(
      new HardwareError('DEVICE_BUSY'),
      new HardwareError('DEVICE_BUSY'),
      new HardwareError('DEVICE_BUSY'),
    );
    const outcome = await printReceipt(printer, receipt(), { retries: 2, delay: noDelay });
    expect(outcome).toEqual({ ok: false, code: 'DEVICE_BUSY', attempts: 3, reprintable: true });
    expect(printer.jobs).toHaveLength(0);
  });

  it('does not retry non-retryable failures and maps unknown errors to IO_ERROR', async () => {
    const printer = new MockPrinter();
    printer.printFailures.push(new Error('driver crashed: C:\\secret\\path'));
    const outcome = await printReceipt(printer, receipt(), { delay: noDelay });
    expect(outcome).toEqual({ ok: false, code: 'IO_ERROR', attempts: 1, reprintable: true });
    expect(JSON.stringify(outcome)).not.toContain('secret');
    expect(printer.printCalls).toBe(1);
  });

  it('never changes the receipt document', async () => {
    const doc = receipt();
    const before = JSON.stringify(doc);
    await printReceipt(new MockPrinter(), doc, { delay: noDelay });
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('cash drawer with a mock drawer', () => {
  it('opens on success and reports a failure without throwing', async () => {
    const drawer = new MockCashDrawer();
    expect(await openDrawer(drawer)).toEqual({ ok: true, attempts: 1 });
    expect(drawer.opened).toBe(1);

    drawer.failWith = new HardwareError('NOT_CONNECTED');
    expect(await openDrawer(drawer)).toEqual({
      ok: false,
      code: 'NOT_CONNECTED',
      attempts: 1,
      reprintable: false,
    });
    drawer.failWith = new Error('boom');
    expect((await openDrawer(drawer)).ok).toBe(false);
    expect(drawer.opened).toBe(1);
  });
});

describe('honesty about hardware', () => {
  it('every mock is flagged as a mock and as not verified on physical hardware', () => {
    for (const device of [new MockPrinter(), new MockCashDrawer(), new MockScanner()]) {
      expect(device.descriptor.isMock).toBe(true);
      expect(device.descriptor.verifiedOnPhysicalHardware).toBe(false);
    }
  });

  it('mock scanner delivers scans to subscribers until unsubscribed', () => {
    const scanner = new MockScanner();
    const seen: string[] = [];
    const off = scanner.onScan((b) => seen.push(b));
    scanner.emit('111');
    off();
    scanner.emit('222');
    expect(seen).toEqual(['111']);
  });

  it('the hardware matrix lists every device as BLOCKED and claims no passing result', () => {
    const matrix = readFileSync('docs/hardware-matrix.md', 'utf8');
    expect(matrix).toContain('BLOCKED');
    expect(matrix).not.toMatch(/\bPASS(ED)?\b/);
    expect(matrix).toMatch(/Supported models:\s*\*\*none\*\*/);
  });
});
