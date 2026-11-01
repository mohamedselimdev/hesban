export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
export const PIN_MIN = 4;
export const PIN_MAX = 8;

export type PolicyViolation =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'TOO_COMMON'
  | 'CONTAINS_USERNAME'
  | 'SINGLE_CHARACTER_REPEATED'
  | 'INVALID_CHARACTERS'
  | 'PIN_NOT_DIGITS'
  | 'PIN_TOO_SIMPLE';

const COMMON = new Set([
  'password',
  'password1',
  '1234567890',
  '12345678',
  'qwertyuiop',
  'iloveyou',
  'admin12345',
  'welcome123',
  'letmein123',
  '0123456789',
  'abc1234567',
]);

/** Normalises digits typed in Arabic-Indic or Persian forms, then rejects weak passwords. */
export function checkPassword(password: string, username: string): PolicyViolation[] {
  const problems: PolicyViolation[] = [];
  if (/\p{Cc}/u.test(password)) problems.push('INVALID_CHARACTERS');
  const length = [...password].length;
  if (length < PASSWORD_MIN) problems.push('TOO_SHORT');
  if (length > PASSWORD_MAX) problems.push('TOO_LONG');
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) problems.push('TOO_COMMON');
  const name = username.trim().toLowerCase();
  if (name.length >= 3 && lower.includes(name)) problems.push('CONTAINS_USERNAME');
  if (length > 0 && new Set([...password]).size === 1) problems.push('SINGLE_CHARACTER_REPEATED');
  return problems;
}

function toAsciiDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

/** Accepts 4 to 8 digits in any digit script; returns the ASCII PIN or the violations. */
export function checkPin(
  pin: string,
): { ok: true; pin: string } | { ok: false; problems: PolicyViolation[] } {
  const ascii = toAsciiDigits(pin.trim());
  const problems: PolicyViolation[] = [];
  if (!/^\d*$/.test(ascii)) problems.push('PIN_NOT_DIGITS');
  if (ascii.length < PIN_MIN) problems.push('TOO_SHORT');
  if (ascii.length > PIN_MAX) problems.push('TOO_LONG');
  if (problems.length === 0) {
    const sequential = '0123456789'.includes(ascii) || '9876543210'.includes(ascii);
    if (new Set(ascii).size === 1 || sequential) problems.push('PIN_TOO_SIMPLE');
  }
  return problems.length === 0 ? { ok: true, pin: ascii } : { ok: false, problems };
}
