export interface KeyInput {
  /** Physical key (`KeyboardEvent.code`). Independent of the active keyboard layout. */
  readonly code: string;
  readonly shiftKey: boolean;
  /** Milliseconds, monotonic (`KeyboardEvent.timeStamp`). */
  readonly timeStamp: number;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
}

export interface ScanDecoderOptions {
  /** Largest gap between two keys of one scan. Hand typing is far slower. */
  readonly maxGapMs: number;
  readonly minLength: number;
  readonly maxLength: number;
}

const DEFAULTS: ScanDecoderOptions = { maxGapMs: 35, minLength: 4, maxLength: 48 };

const PASSIVE = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'CapsLock',
  'MetaLeft',
  'MetaRight',
]);
const TERMINATORS = new Set(['Enter', 'NumpadEnter', 'Tab']);

const PUNCTUATION: Readonly<Record<string, [plain: string, shifted: string]>> = {
  Minus: ['-', '_'],
  NumpadSubtract: ['-', '-'],
  Period: ['.', '.'],
  NumpadDecimal: ['.', '.'],
  Slash: ['/', '/'],
  NumpadDivide: ['/', '/'],
};

/** Maps a physical key to the character a scanner meant, or null if it is not a barcode character. */
export function charForKey(code: string, shiftKey: boolean): string | null {
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) return digit[1] as string;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return shiftKey ? (letter[1] as string) : (letter[1] as string).toLowerCase();
  const punctuation = PUNCTUATION[code];
  if (punctuation) return shiftKey ? punctuation[1] : punctuation[0];
  return null;
}

/**
 * Tells scanner input from typing. A scan is a run of barcode characters with tiny gaps ended by
 * Enter/Tab. Slow typing, other keys, or a too-short run are ignored and nothing is emitted.
 */
export function createScanDecoder(options: Partial<ScanDecoderOptions> = {}) {
  const opts = { ...DEFAULTS, ...options };
  let buffer = '';
  let last = 0;
  let poisoned = false;

  const reset = () => {
    buffer = '';
    poisoned = false;
  };

  return {
    reset,
    /** Returns the barcode when this key completes a scan, otherwise null. */
    push(event: KeyInput): string | null {
      if (PASSIVE.has(event.code)) return null;
      if (event.ctrlKey || event.altKey || event.metaKey) {
        reset();
        return null;
      }
      if (buffer !== '' && event.timeStamp - last > opts.maxGapMs) reset();
      const hadGap = buffer === '';
      last = event.timeStamp;

      if (TERMINATORS.has(event.code)) {
        const complete = !poisoned && buffer.length >= opts.minLength ? buffer : null;
        reset();
        return complete;
      }

      const char = charForKey(event.code, event.shiftKey);
      if (char === null || buffer.length >= opts.maxLength) {
        poisoned = true;
        if (hadGap) buffer = '';
        return null;
      }
      buffer += char;
      return null;
    },
  };
}

/** True for a valid GTIN-8, UPC-A (12), EAN-13 or GTIN-14 check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop() as number;
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}
