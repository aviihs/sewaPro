/**
 * Nepal mobile numbers: 10 digits starting with 96, 97 or 98 (NTC, Ncell, Smart).
 * Accepted input: `98XXXXXXXX`, `+97798XXXXXXXX`, `97798XXXXXXXX`, with spaces or dashes.
 * Canonical form (stored and compared): E.164 `+9779XXXXXXXXX`.
 */
const NATIONAL_MOBILE = /^9[678]\d{8}$/;

export function normalizeNepalPhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  const national = digits.replace(/^\+?977/, '');
  return NATIONAL_MOBILE.test(national) ? `+977${national}` : null;
}

/** Masks all but the last 3 digits, for logs and partially private views. */
export function maskPhone(phone: string): string {
  return phone.length <= 3 ? '***' : `${'*'.repeat(phone.length - 3)}${phone.slice(-3)}`;
}
