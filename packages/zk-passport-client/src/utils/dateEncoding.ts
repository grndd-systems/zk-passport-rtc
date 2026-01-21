/**
 * Encode date in Passport Timestamp (PT) format
 *
 * Converts YYMMDD decimal to UTF-8 encoded hex bigint:
 * - YYMMDD number → "YYMMDD" string
 * - Each character → UTF-8 byte → hex
 * - Concatenated hex → bigint
 *
 * @example
 * encodePassportDate(260411) // April 11, 2026
 * // "260411" → UTF-8 [0x32,0x36,0x30,0x34,0x31,0x31]
 * // → "323630343131" → 0x323630343131 → 55208318349617n
 *
 * @example
 * encodePassportDate(0) // Zero time for circuits
 * // "000000" → UTF-8 [0x30,0x30,0x30,0x30,0x30,0x30]
 * // → "303030303030" → 0x303030303030 → 52983525027888n
 */
export function encodePassportDate(dateNum: number): bigint {
  // Step 1: Convert number to YYMMDD string
  const dateStr = dateNum.toString().padStart(6, '0');

  // Step 2: Convert each ASCII character to its hex code
  const hex = dateStr
    .split('')
    .map((c) => c.charCodeAt(0).toString(16))
    .join('');

  // Step 3: Convert hex string to bigint
  return BigInt(`0x${hex}`);
}

/**
 * Get current date in YYMMDD format
 */
export function getCurrentDateYYMMDD(): number {
  const now = new Date();
  return parseInt(
    now.getFullYear().toString().slice(-2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0')
  );
}

/**
 * Get date N months in the future in YYMMDD format
 */
export function getFutureDateYYMMDD(monthsFromNow: number): number {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsFromNow);
  return parseInt(
    date.getFullYear().toString().slice(-2) +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  );
}

/**
 * Decode passport date from hex ASCII encoding back to YYMMDD number
 *
 * @example
 * decodePassportDate(52983525027888n) // "000000" → 0
 * decodePassportDate(55207268360497n) // "251011" → 251011
 */
export function decodePassportDate(encoded: bigint | string): number {
  // Convert to bigint if string
  const value = typeof encoded === 'string' ? BigInt(encoded) : encoded;

  // Convert to hex and remove 0x prefix
  const hex = value.toString(16);

  // Convert each pair of hex digits to ASCII character
  const dateStr = hex
    .match(/.{2}/g)
    ?.map((pair) => String.fromCharCode(parseInt(pair, 16)))
    .join('') || '000000';

  // Convert to number
  return parseInt(dateStr);
}

/**
 * Format decoded YYMMDD date to readable string
 *
 * Uses sliding window algorithm to determine century:
 * - If YY > (currentYear + 50) % 100, it's 19XX
 * - Otherwise it's 20XX
 *
 * This correctly handles birth dates (typically 19XX for adults)
 * and expiration dates (typically 20XX for future dates)
 *
 * @example
 * formatPassportDate(251011) // "2025-10-11" (assuming current year is 2025)
 * formatPassportDate(850101) // "1985-01-01" (birth date)
 * formatPassportDate(0) // "N/A (no restriction)"
 */
export function formatPassportDate(dateNum: number): string {
  if (dateNum === 0) return 'N/A (no restriction)';

  const dateStr = dateNum.toString().padStart(6, '0');
  const yy = parseInt(dateStr.slice(0, 2), 10);
  const mm = dateStr.slice(2, 4);
  const dd = dateStr.slice(4, 6);

  // Sliding window: use 50-year window from current year
  const currentYear = new Date().getFullYear();
  const currentYY = currentYear % 100;
  const cutoff = (currentYY + 50) % 100;

  // If YY > cutoff, it's 19XX, otherwise 20XX
  const century = yy > cutoff ? '19' : '20';
  const yyStr = yy.toString().padStart(2, '0');

  return `${century}${yyStr}-${mm}-${dd}`;
}
