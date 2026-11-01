import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow, WebContents } from 'electron';

/**
 * Layout and keyboard probe. Runs only when HESBAN_UICHECK=1 and the app is not packaged,
 * against a build made with VITE_GALLERY=1. Writes a JSON report and one PNG per viewport.
 */
const VIEWPORTS = [
  { w: 1920, h: 1080, zoom: 1 },
  { w: 1366, h: 768, zoom: 1 },
  { w: 1366, h: 768, zoom: 1.25 },
  { w: 1024, h: 600, zoom: 1 },
  { w: 800, h: 600, zoom: 1 },
] as const;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const LAYOUT_PROBE = `(() => {
  const cells = [...document.querySelectorAll('[data-testid=grid] td, [data-testid=grid] th')];
  const controls = [...document.querySelectorAll('button, input')];
  const doc = document.documentElement;
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    htmlDir: doc.dir,
    htmlLang: doc.lang,
    bodyDirection: getComputedStyle(document.body).direction,
    docOverflowX: doc.scrollWidth > doc.clientWidth + 1,
    bodyFontFamily: getComputedStyle(document.body).fontFamily,
    cairoArabicLoaded: document.fonts.check('16px Cairo', 'مرحبا'),
    cairoLatinLoaded: document.fonts.check('16px Cairo', 'ABC'),
    loadedFaces: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight),
    minCellFontPx: Math.min(...cells.map((c) => parseFloat(getComputedStyle(c).fontSize))),
    minControlHeightPx: Math.min(...controls.map((c) => c.getBoundingClientRect().height)),
    numericAlign: [...new Set([...document.querySelectorAll('td.num, th.num')].map((c) => getComputedStyle(c).textAlign))],
    textAlignStart: [...new Set([...document.querySelectorAll('[data-testid=grid] td:not(.num)')].map((c) => getComputedStyle(c).textAlign))],
    layoutColumns: getComputedStyle(document.querySelector('[data-testid=gallery]')).gridTemplateColumns.split(' ').length,
    clippedCells: cells.filter((c) => c.scrollWidth > c.clientWidth + 1).length,
    bdiDirs: [...new Set([...document.querySelectorAll('bdi')].map((b) => b.getAttribute('dir')))],
    navFirstRight: document.querySelector('[data-testid=nav-0]').getBoundingClientRect().right,
    mainFirstRight: document.querySelector('[data-testid=f-name]').getBoundingClientRect().right,
    totalText: document.querySelector('[data-testid=invoice-total]').textContent,
    mixedText: document.querySelector('[data-testid=mixed]').textContent,
  };
})()`;

async function press(contents: WebContents, keyCode: string, modifiers: string[] = []) {
  const base = { keyCode, modifiers: modifiers as never };
  contents.sendInputEvent({ type: 'keyDown', ...base });
  contents.sendInputEvent({ type: 'keyUp', ...base });
  await wait(60);
}

const activeId = (contents: WebContents) =>
  contents.executeJavaScript(
    `(() => { const a = document.activeElement; return a ? (a.getAttribute('data-testid') || a.getAttribute('data-cell') || a.tagName) : null; })()`,
  ) as Promise<string | null>;

async function waitForGallery(contents: WebContents) {
  for (let i = 0; i < 50; i++) {
    const ready = await contents.executeJavaScript(
      `!!document.querySelector('[data-testid=gallery]')`,
    );
    if (ready) return;
    await wait(100);
  }
  throw new Error('gallery did not render (build without VITE_GALLERY=1?)');
}

export async function runUiCheck(win: BrowserWindow, outDir: string): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const contents = win.webContents;
  const report: Record<string, unknown> = {};
  try {
    win.show();
    win.focus();
    contents.focus();
    await contents.executeJavaScript(`location.hash = '#/gallery'`);
    await waitForGallery(contents);
    await contents.executeJavaScript(`document.fonts.ready.then(() => true)`);

    const layouts: unknown[] = [];
    for (const vp of VIEWPORTS) {
      contents.setZoomFactor(vp.zoom);
      win.setContentSize(vp.w, vp.h);
      await wait(400);
      const probe = (await contents.executeJavaScript(LAYOUT_PROBE)) as Record<string, unknown>;
      const image = await contents.capturePage();
      const file = `gallery-${vp.w}x${vp.h}-zoom${String(vp.zoom).replace('.', '_')}.png`;
      writeFileSync(join(outDir, file), image.toPNG());
      layouts.push({ requested: vp, screenshot: file, ...probe });
    }
    report['layouts'] = layouts;

    // Keyboard: Tab order from a cleared focus at a normal size.
    contents.setZoomFactor(1);
    win.setContentSize(1366, 768);
    await wait(300);
    await contents.executeJavaScript(`document.activeElement && document.activeElement.blur()`);
    const tabOrder: Array<string | null> = [];
    for (let i = 0; i < 11; i++) {
      await press(contents, 'Tab');
      tabOrder.push(await activeId(contents));
    }
    report['tabOrder'] = tabOrder;

    // Keyboard: arrow navigation in the grid (right-to-left layout).
    await contents.executeJavaScript(`document.querySelector('[data-cell="0-1"]').focus()`);
    const grid: Record<string, string | null> = { start: await activeId(contents) };
    await press(contents, 'Left');
    grid['afterLeft'] = await activeId(contents);
    await press(contents, 'Right');
    grid['afterRight'] = await activeId(contents);
    await press(contents, 'Down');
    grid['afterDown'] = await activeId(contents);
    await press(contents, 'End');
    grid['afterEnd'] = await activeId(contents);
    await press(contents, 'Home');
    grid['afterHome'] = await activeId(contents);
    await press(contents, 'End', ['control']);
    grid['afterCtrlEnd'] = await activeId(contents);
    await press(contents, 'Home', ['control']);
    grid['afterCtrlHome'] = await activeId(contents);
    report['grid'] = grid;

    // Input: Arabic-Indic digits typed into numeric fields are normalised on blur.
    await contents.executeJavaScript(`document.querySelector('[data-testid=f-price]').focus()`);
    await contents.insertText('١٬٢٣٤٫٥٠');
    await press(contents, 'Tab');
    const invalidPrice = (await contents.executeJavaScript(`(() => {
      const el = document.querySelector('[data-testid=f-price]');
      return { value: el.value, piastres: el.dataset.piastres, invalid: el.getAttribute('aria-invalid') };
    })()`)) as Record<string, unknown>;
    await contents.executeJavaScript(
      `(() => { const el = document.querySelector('[data-testid=f-price]'); el.focus(); el.select(); })()`,
    );
    await contents.insertText('١٢٫٥٠');
    await press(contents, 'Tab');
    await contents.insertText('٠٫٣٥٠');
    await press(contents, 'Tab');
    report['input'] = {
      ...(await contents.executeJavaScript(`(() => {
        const p = document.querySelector('[data-testid=f-price]');
        const q = document.querySelector('[data-testid=f-qty]');
        return { priceValue: p.value, piastres: p.dataset.piastres, priceInvalid: p.getAttribute('aria-invalid'),
                 qtyValue: q.value, milli: q.dataset.milli, qtyInvalid: q.getAttribute('aria-invalid') };
      })()`)),
      afterGroupedInput: invalidPrice,
    };

    // Digit style switch re-renders amounts.
    await contents.executeJavaScript(
      `document.querySelector('[data-testid=digit-arabic]').click()`,
    );
    await wait(250);
    writeFileSync(
      join(outDir, 'gallery-arabic-indic-digits.png'),
      (await contents.capturePage()).toPNG(),
    );
    report['arabicIndicTotal'] = await contents.executeJavaScript(
      `document.querySelector('[data-testid=invoice-total]').textContent`,
    );
    await contents.executeJavaScript(
      `document.querySelector('[data-testid=digit-western]').click()`,
    );
    await wait(150);
    report['westernTotal'] = await contents.executeJavaScript(
      `document.querySelector('[data-testid=invoice-total]').textContent`,
    );
  } catch (error) {
    report['fatal'] = error instanceof Error ? error.message : String(error);
  }
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
}
