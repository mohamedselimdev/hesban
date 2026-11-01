import { toArabicIndic } from '../domain/digits';
import { formatEgp, type DigitStyle, type Piastres } from '../domain/money';
import { formatQty, type Milli } from '../domain/qty';

export type { DigitStyle };

export const CAIRO_TIME_ZONE = 'Africa/Cairo';
const CURRENCY_LABEL = 'ج.م';

/** Unicode isolates keep numbers readable inside right-to-left plain text (receipts, exports). */
export function isolateLtr(text: string): string {
  return `⁦${text}⁩`;
}

function applyStyle(ascii: string, style: DigitStyle): string {
  if (style === 'western') return ascii;
  // toArabicIndic maps digits and '.'; grouping comma needs the Arabic thousands separator too.
  return toArabicIndic(ascii).replace(/,/g, '٬');
}

/** "1,234.50" or "١٬٢٣٤٫٥٠". No currency label, no bidi marks. */
export function formatMoney(value: Piastres, style: DigitStyle = 'western'): string {
  const ascii = formatEgp(value);
  const negative = ascii.startsWith('-');
  const unsigned = negative ? ascii.slice(1) : ascii;
  const [whole = '0', fraction = '00'] = unsigned.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return applyStyle(`${negative ? '-' : ''}${grouped}.${fraction}`, style);
}

/** Money with currency label, as a single plain-text string safe inside RTL text. */
export function formatMoneyWithCurrency(value: Piastres, style: DigitStyle = 'western'): string {
  return `${isolateLtr(formatMoney(value, style))} ${CURRENCY_LABEL}`;
}

export function formatQuantity(value: Milli, style: DigitStyle = 'western'): string {
  return formatQty(value, style);
}

interface CairoParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

const partsFormatter = new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn', {
  timeZone: CAIRO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function cairoParts(isoUtc: string): CairoParts {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid date: ${isoUtc}`);
  const map: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(date)) map[part.type] = part.value;
  return map as unknown as CairoParts;
}

/** Local Cairo calendar date as YYYY-MM-DD (storage form of `business_date`). */
export function cairoDate(isoUtc: string): string {
  const p = cairoParts(isoUtc);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "DD/MM/YYYY HH:mm" in Cairo local time. */
export function formatDateTime(isoUtc: string, style: DigitStyle = 'western'): string {
  const p = cairoParts(isoUtc);
  return applyStyle(`${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`, style);
}

/** "DD/MM/YYYY" from a stored business date (YYYY-MM-DD). */
export function formatBusinessDate(businessDate: string, style: DigitStyle = 'western'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(businessDate);
  if (!match) throw new Error(`invalid business date: ${businessDate}`);
  return applyStyle(`${match[3]}/${match[2]}/${match[1]}`, style);
}

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAIRO_TIME_ZONE,
  timeZoneName: 'longOffset',
});

/** Cairo UTC offset in minutes at an instant, taken from the platform time-zone database. */
export function cairoUtcOffsetMinutes(isoUtc: string): number {
  const name = offsetFormatter
    .formatToParts(new Date(isoUtc))
    .find((p) => p.type === 'timeZoneName')?.value;
  const match = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(name ?? '');
  if (!match) throw new Error(`unexpected offset text: ${name}`);
  if (!match[1]) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}
