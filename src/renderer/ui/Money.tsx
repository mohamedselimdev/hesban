import type { DigitStyle } from '../../shared/format';
import { formatMoney } from '../../shared/format';
import type { Piastres } from '../../domain/money';

/** Amount that always reads left-to-right, even inside right-to-left text. */
export function Money({ value, style }: { value: Piastres; style: DigitStyle }) {
  return <bdi dir="ltr">{formatMoney(value, style)}</bdi>;
}

/** Any Latin or numeric token (codes, phone numbers) inside Arabic text. */
export function Ltr({ children }: { children: string }) {
  return <bdi dir="ltr">{children}</bdi>;
}
