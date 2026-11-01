const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

/**
 * Normalises user-typed numerals to ASCII: Arabic-Indic and Persian digits become 0-9,
 * the Arabic decimal separator becomes '.', the Arabic thousands separator and spaces are removed.
 */
export function normalizeDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) as number;
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9) {
      out += String(code - EXTENDED_ARABIC_INDIC_ZERO);
    } else if (ch === '٫') {
      out += '.';
    } else if (ch === '٬' || ch === ' ' || ch === ' ') {
      // dropped
    } else {
      out += ch;
    }
  }
  return out;
}

/** Display only: converts ASCII digits and '.' to Arabic-Indic digits and the Arabic decimal separator. */
export function toArabicIndic(ascii: string): string {
  let out = '';
  for (const ch of ascii) {
    if (ch >= '0' && ch <= '9') {
      out += String.fromCodePoint(ARABIC_INDIC_ZERO + Number(ch));
    } else if (ch === '.') {
      out += '٫';
    } else {
      out += ch;
    }
  }
  return out;
}
