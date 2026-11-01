import { authStrings } from './auth-strings';

/**
 * Arabic UI strings. v1 ships Arabic only; strings live here, never inline in components,
 * so a second language or wording review needs no component changes.
 */
export const ar = {
  appName: 'حسبان',
  auth: authStrings,
  gallery: {
    title: 'معرض المكوّنات',
    digitStyle: 'شكل الأرقام',
    western: 'أرقام غربية (0-9)',
    arabicIndic: 'أرقام هندية (٠-٩)',
    formTitle: 'بيانات المنتج',
    productName: 'اسم المنتج',
    barcode: 'الباركود',
    price: 'سعر البيع (ج.م)',
    quantity: 'الكمية',
    parsedAs: 'القيمة المخزّنة بالقرش',
    tableTitle: 'بنود الفاتورة',
    colIndex: 'م',
    colProduct: 'الصنف',
    colQty: 'الكمية',
    colPrice: 'السعر',
    colTotal: 'الإجمالي',
    total: 'إجمالي الفاتورة',
    mixedTitle: 'نصوص مختلطة',
    invoiceLine: 'فاتورة رقم',
    onDate: 'بتاريخ',
    phone: 'الهاتف',
    nav: ['المبيعات', 'المشتريات', 'المخزون', 'التقارير'],
  },
} as const;

type Join<K extends string, V> = V extends string
  ? K
  : V extends readonly string[]
    ? K
    : V extends object
      ? { [P in keyof V & string]: Join<`${K}.${P}`, V[P]> }[keyof V & string]
      : never;

export type StringKey = {
  [P in keyof typeof ar & string]: Join<P, (typeof ar)[P]>;
}[keyof typeof ar & string];

/** Typed lookup: `t('gallery.title')`. Unknown keys fail at compile time. */
export function t(key: StringKey): string {
  let node: unknown = ar;
  for (const part of key.split('.')) {
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== 'string') throw new Error(`not a string key: ${key}`);
  return node;
}
