import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import electronPath from 'electron';

/**
 * Builds a gallery variant (VITE_GALLERY=1) into out-ui, runs it in a real Electron window and
 * reads the layout/keyboard report. Screenshots are kept in out-ui/screens for human review.
 */
const root = process.cwd();
const outDir = join(root, 'out-ui');
const screens = join(outDir, 'screens');
let report: Record<string, unknown> = {};
const scratch = join(tmpdir(), `hesban-ui-${process.pid}`);

function run(command: string, args: string[], env: Record<string, string>, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: 'ignore',
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out`));
    }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

beforeAll(async () => {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(screens, { recursive: true });
  await run(
    process.execPath,
    [join(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'build'],
    { HESBAN_OUT_DIR: 'out-ui', VITE_GALLERY: '1' },
    120_000,
  );
  await run(
    String(electronPath),
    [join(outDir, 'main/index.js'), `--user-data-dir=${join(scratch, 'data')}`],
    {
      HESBAN_UICHECK: '1',
      HESBAN_UICHECK_OUT: screens,
      ELECTRON_RENDERER_URL: '',
    },
    120_000,
  );
  report = JSON.parse(readFileSync(join(screens, 'report.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}, 300_000);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

interface Layout {
  requested: { w: number; h: number; zoom: number };
  screenshot: string;
  innerWidth: number;
  htmlDir: string;
  htmlLang: string;
  bodyDirection: string;
  docOverflowX: boolean;
  bodyFontFamily: string;
  cairoArabicLoaded: boolean;
  cairoLatinLoaded: boolean;
  minCellFontPx: number;
  minControlHeightPx: number;
  numericAlign: string[];
  textAlignStart: string[];
  layoutColumns: number;
  clippedCells: number;
  bdiDirs: string[];
  navFirstRight: number;
  mainFirstRight: number;
  totalText: string;
  mixedText: string;
}

const layouts = () => report['layouts'] as Layout[];

describe('arabic RTL UI in a real Electron window', () => {
  it('rendered the gallery without a fatal error', () => {
    expect(report['fatal']).toBeUndefined();
    expect(layouts()).toHaveLength(5);
  });

  it('saved a screenshot per viewport', () => {
    for (const l of layouts())
      expect(existsSync(join(screens, l.screenshot)), l.screenshot).toBe(true);
    expect(existsSync(join(screens, 'gallery-arabic-indic-digits.png'))).toBe(true);
  });

  it('is right-to-left Arabic with the bundled Cairo font at every size', () => {
    for (const l of layouts()) {
      expect(l.htmlDir).toBe('rtl');
      expect(l.htmlLang).toBe('ar-EG');
      expect(l.bodyDirection).toBe('rtl');
      expect(l.bodyFontFamily.startsWith('Cairo')).toBe(true);
      expect(l.cairoArabicLoaded).toBe(true);
      expect(l.cairoLatinLoaded).toBe(true);
    }
  });

  it('never scrolls the page horizontally and clips no table cell', () => {
    for (const l of layouts()) {
      expect(l.docOverflowX, `${l.requested.w}x${l.requested.h}@${l.requested.zoom}`).toBe(false);
      expect(l.clippedCells).toBe(0);
    }
  });

  it('meets text size and touch-target minimums (NFR-09)', () => {
    for (const l of layouts()) {
      expect(l.minCellFontPx).toBeGreaterThanOrEqual(14);
      expect(l.minControlHeightPx).toBeGreaterThanOrEqual(40);
    }
  });

  it('aligns amounts to the end edge and text to the start edge; isolates LTR runs', () => {
    for (const l of layouts()) {
      expect(l.numericAlign).toEqual(['end']);
      expect(l.textAlignStart).toEqual(['start']);
      expect(l.bdiDirs).toEqual(['ltr']);
    }
  });

  it('collapses to one column at or below 900 CSS px and keeps the nav at the start (right) otherwise', () => {
    for (const l of layouts()) {
      const wide = l.innerWidth > 900;
      expect(l.layoutColumns, `${l.innerWidth}px`).toBe(wide ? 2 : 1);
      if (wide) expect(l.navFirstRight).toBeGreaterThan(l.mainFirstRight);
    }
    expect(layouts().some((l) => l.innerWidth > 900)).toBe(true);
    expect(layouts().some((l) => l.innerWidth <= 900)).toBe(true);
  });

  it('keeps Tab order in reading order (right to left) with one stop for the grid and radio group', () => {
    expect((report['tabOrder'] as string[]).slice(0, 10)).toEqual([
      'nav-0',
      'nav-1',
      'nav-2',
      'nav-3',
      'digit-western',
      'f-name',
      'f-barcode',
      'f-price',
      'f-qty',
      '0-0',
    ]);
  });

  it('moves grid focus with arrow keys following reading direction', () => {
    expect(report['grid']).toEqual({
      start: '0-1',
      afterLeft: '0-2', // RTL: Left arrow goes to the next column
      afterRight: '0-1',
      afterDown: '1-1',
      afterEnd: '1-4',
      afterHome: '1-0',
      afterCtrlEnd: '3-4',
      afterCtrlHome: '0-0',
    });
  });

  it('normalises Arabic-Indic digits typed into price and quantity', () => {
    const input = report['input'] as Record<string, unknown>;
    expect(input['afterGroupedInput']).toEqual({
      value: '1234.50',
      piastres: '123450',
      invalid: 'false',
    });
    expect(input['priceValue']).toBe('12.50');
    expect(input['piastres']).toBe('1250');
    expect(input['qtyValue']).toBe('0.35');
    expect(input['milli']).toBe('350');
    expect(input['priceInvalid']).toBe('false');
    expect(input['qtyInvalid']).toBe('false');
  });

  it('renders the same invoice total in both digit styles (2×85.50 + 450.00 + 0.350×85.50 + 12×37.50)', () => {
    expect(report['westernTotal']).toBe('1,100.93');
    expect(report['arabicIndicTotal']).toBe('١٬١٠٠٫٩٣');
  });

  it('keeps mixed Arabic, Latin and numeric text intact', () => {
    const text = layouts()[0]?.mixedText ?? '';
    expect(text).toContain('INV-000123');
    expect(text).toContain('01012345678');
    expect(text).toContain('01/11/2026');
    expect(text).toContain('14:05'); // 12:05 UTC is 14:05 in Cairo (UTC+2 in November)
  });
});
