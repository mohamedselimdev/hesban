import { formatDateTime, formatMoney, formatQuantity, isolateLtr } from '../../shared/format';
import { columnsFor, receiptLabels, type ReceiptDocument } from './model';

const segmenter = new Intl.Segmenter('ar', { granularity: 'grapheme' });
const INVISIBLE = /^[\p{Cf}\p{Cc}]+$/u;

/** Removes control characters and bidi overrides from user-supplied text before printing. */
export function sanitizeText(text: string): string {
  return text
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\p{Cf}/gu, (c) => (c === '‌' || c === '‍' ? c : ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Printed width in columns: one per visible grapheme; combining marks and bidi isolates are free. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (!INVISIBLE.test(segment)) width++;
  }
  return width;
}

function splitLongWord(word: string, columns: number): string[] {
  const parts: string[] = [];
  let current = '';
  let currentWidth = 0;
  for (const { segment } of segmenter.segment(word)) {
    const w = INVISIBLE.test(segment) ? 0 : 1;
    if (currentWidth + w > columns) {
      parts.push(current);
      current = '';
      currentWidth = 0;
    }
    current += segment;
    currentWidth += w;
  }
  if (current !== '') parts.push(current);
  return parts;
}

/** Wraps at spaces; words wider than a line are split between grapheme clusters, never inside one. */
export function wrapText(text: string, columns: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of sanitizeText(text).split(' ').filter(Boolean)) {
    for (const piece of splitLongWord(word, columns)) {
      const candidate = line === '' ? piece : `${line} ${piece}`;
      if (displayWidth(candidate) <= columns) {
        line = candidate;
      } else {
        if (line !== '') lines.push(line);
        line = piece;
      }
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

function pair(label: string, value: string, columns: number): string[] {
  const gap = columns - displayWidth(label) - displayWidth(value);
  if (gap >= 1) return [`${label}${' '.repeat(gap)}${value}`];
  return [label, value];
}

/**
 * Plain-text receipt in logical (reading) order, already wrapped to the paper width.
 * Numbers are wrapped in Unicode isolates so right-to-left text cannot reorder their digits.
 */
export function renderReceiptText(doc: ReceiptDocument): string[] {
  const columns = columnsFor(doc.paperWidth);
  const style = doc.digitStyle;
  const money = (v: Parameters<typeof formatMoney>[0]) => isolateLtr(formatMoney(v, style));
  const rule = '-'.repeat(columns);
  const out: string[] = [];

  if (doc.isCopy) out.push(...wrapText(`*** ${receiptLabels.copy} ***`, columns));
  out.push(...wrapText(doc.shopName, columns));
  if (doc.shopAddress) out.push(...wrapText(doc.shopAddress, columns));
  if (doc.shopPhone) out.push(isolateLtr(sanitizeText(doc.shopPhone)));
  out.push(rule);
  out.push(...wrapText(doc.documentLabel, columns));
  out.push(...pair(receiptLabels.number, isolateLtr(sanitizeText(doc.number)), columns));
  out.push(...pair(receiptLabels.date, isolateLtr(formatDateTime(doc.issuedAt, style)), columns));
  if (doc.cashier) out.push(...wrapText(`${receiptLabels.cashier}: ${doc.cashier}`, columns));
  if (doc.customerName) {
    out.push(...wrapText(`${receiptLabels.customer}: ${doc.customerName}`, columns));
  }
  out.push(rule);

  for (const line of doc.lines) {
    out.push(...wrapText(line.name, columns));
    const detail = `${formatQuantity(line.qty, style)} × ${formatMoney(line.unitPrice, style)}`;
    out.push(...pair(isolateLtr(detail), money(line.total), columns));
  }
  out.push(rule);

  if (doc.discount !== 0) out.push(...pair(receiptLabels.discount, money(doc.discount), columns));
  out.push(...pair(receiptLabels.total, money(doc.total), columns));
  out.push(...pair(receiptLabels.paid, money(doc.paid), columns));
  if (doc.change !== 0) out.push(...pair(receiptLabels.change, money(doc.change), columns));
  if (doc.due !== 0) out.push(...pair(receiptLabels.due, money(doc.due), columns));
  out.push(rule);
  out.push(...wrapText(doc.footer ?? receiptLabels.thanks, columns));
  return out;
}
