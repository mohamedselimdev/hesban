import type { DigitStyle, Piastres } from '../../domain/money';
import type { Milli } from '../../domain/qty';
import type { PaperWidth } from '../ports/hardware';

export interface ReceiptLine {
  readonly name: string;
  readonly qty: Milli;
  readonly unitPrice: Piastres;
  readonly total: Piastres;
}

/** Structured receipt data. Renderers build text/HTML from this; never from pre-built strings. */
export interface ReceiptDocument {
  readonly shopName: string;
  readonly shopAddress: string | undefined;
  readonly shopPhone: string | undefined;
  readonly documentLabel: string;
  readonly number: string;
  /** UTC instant, rendered in Africa/Cairo. */
  readonly issuedAt: string;
  readonly cashier: string | undefined;
  readonly customerName: string | undefined;
  readonly lines: readonly ReceiptLine[];
  readonly discount: Piastres;
  readonly total: Piastres;
  readonly paid: Piastres;
  readonly change: Piastres;
  readonly due: Piastres;
  readonly footer: string | undefined;
  /** Reprints are always marked as a copy. */
  readonly isCopy: boolean;
  readonly paperWidth: PaperWidth;
  readonly digitStyle: DigitStyle;
}

export const receiptLabels = {
  copy: 'نسخة',
  number: 'رقم',
  date: 'التاريخ',
  cashier: 'الكاشير',
  customer: 'العميل',
  discount: 'الخصم',
  total: 'الإجمالي',
  paid: 'المدفوع',
  change: 'الباقي للعميل',
  due: 'المتبقي على العميل',
  currency: 'ج.م',
  thanks: 'شكراً لزيارتكم',
} as const;

/** Characters per line on a thermal printer using the usual 12-dot font. */
export function columnsFor(width: PaperWidth): number {
  return width === 58 ? 32 : 48;
}
