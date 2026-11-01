import { formatDateTime, formatMoney, formatQuantity } from '../../shared/format';
import { receiptLabels, type ReceiptDocument } from './model';
import { sanitizeText } from './text';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for use in element content and attribute values. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] as string);
}

const clean = (text: string) => escapeHtml(sanitizeText(text));
const ltr = (text: string) => `<bdi dir="ltr">${escapeHtml(text)}</bdi>`;

/**
 * Receipt as a self-contained HTML page for the Windows print driver.
 * Built only from structured data; every user-supplied string is sanitised and escaped.
 * The page has no script and its policy forbids loading anything.
 */
export function renderReceiptHtml(doc: ReceiptDocument): string {
  const style = doc.digitStyle;
  const money = (v: Parameters<typeof formatMoney>[0]) => ltr(formatMoney(v, style));
  const printable = doc.paperWidth === 58 ? 48 : 72;
  const row = (label: string, value: string) =>
    `<div class="row"><span>${escapeHtml(label)}</span><span>${value}</span></div>`;

  const lines = doc.lines
    .map(
      (l) =>
        `<div class="item"><div class="name">${clean(l.name)}</div>` +
        `<div class="row"><span>${ltr(`${formatQuantity(l.qty, style)} × ${formatMoney(l.unitPrice, style)}`)}</span>` +
        `<span>${money(l.total)}</span></div></div>`,
    )
    .join('');

  const parts: string[] = [];
  if (doc.isCopy) parts.push(`<div class="copy">*** ${escapeHtml(receiptLabels.copy)} ***</div>`);
  parts.push(`<h1>${clean(doc.shopName)}</h1>`);
  if (doc.shopAddress) parts.push(`<div class="center">${clean(doc.shopAddress)}</div>`);
  if (doc.shopPhone) parts.push(`<div class="center">${ltr(sanitizeText(doc.shopPhone))}</div>`);
  parts.push('<hr />', `<div class="center">${clean(doc.documentLabel)}</div>`);
  parts.push(row(receiptLabels.number, ltr(sanitizeText(doc.number))));
  parts.push(row(receiptLabels.date, ltr(formatDateTime(doc.issuedAt, style))));
  if (doc.cashier) parts.push(row(receiptLabels.cashier, clean(doc.cashier)));
  if (doc.customerName) parts.push(row(receiptLabels.customer, clean(doc.customerName)));
  parts.push('<hr />', lines, '<hr />');
  if (doc.discount !== 0) parts.push(row(receiptLabels.discount, money(doc.discount)));
  parts.push(`<div class="total">${row(receiptLabels.total, money(doc.total))}</div>`);
  parts.push(row(receiptLabels.paid, money(doc.paid)));
  if (doc.change !== 0) parts.push(row(receiptLabels.change, money(doc.change)));
  if (doc.due !== 0) parts.push(row(receiptLabels.due, money(doc.due)));
  parts.push('<hr />', `<div class="center">${clean(doc.footer ?? receiptLabels.thanks)}</div>`);

  const css =
    `@page{size:${doc.paperWidth}mm auto;margin:0}` +
    `body{margin:0;padding:2mm;width:${printable}mm;direction:rtl;font-family:'Cairo','Segoe UI',Tahoma,sans-serif;font-size:11pt;line-height:1.35;color:#000}` +
    `h1{font-size:14pt;text-align:center;margin:0 0 1mm}.center{text-align:center}` +
    `.row{display:flex;justify-content:space-between;gap:2mm}.name{font-weight:700}` +
    `.item{margin-block:1mm}.total{font-weight:700;font-size:12pt}` +
    `.copy{text-align:center;font-weight:700;border:1px solid #000;margin-block-end:2mm}` +
    `hr{border:0;border-top:1px dashed #000;margin:1.5mm 0}`;

  return (
    `<!doctype html><html lang="ar-EG" dir="rtl"><head><meta charset="utf-8" />` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'self'" />` +
    `<title>${escapeHtml(receiptLabels.number)} ${clean(doc.number)}</title><style>${css}</style></head>` +
    `<body>${parts.join('')}</body></html>`
  );
}
