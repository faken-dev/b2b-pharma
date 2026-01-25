import {
  CountryCode,
  parsePhoneNumberFromString,
  PhoneNumber,
} from 'libphonenumber-js';

// Default country: Vietnam (VN).
const DEFAULT_COUNTRY = 'VN';

/**
 * Parse a raw phone string and return its **E.164** representation.
 * Throws an error if the number is not possible.
 *
 * @param raw   Raw user input (e.g. "0912 345 678", "+84 912 345 678")
 * @param countryCode ISO‑2 country (default = VN)
 * @returns string in E.164 format (e.g. "+84912345678")
 */
export function normalizePhone(
  raw: string,
  countryCode: string = DEFAULT_COUNTRY,
): string {
  const phone: PhoneNumber | undefined = parsePhoneNumberFromString(
    raw,
    countryCode as CountryCode,
  );
  if (!phone || !phone.isValid()) {
    throw new Error('Invalid phone number');
  }
  return phone.number;
}

/**
 * Simple helper that tells whether a string *looks* like a phone number.
 * Used by the unified‑login endpoint to decide which field to query.
 */
export function looksLikePhone(input: string): boolean {
  // If it contains any digit and starts with '+' or a digit >0, assume phone.
  // This is a heuristic – the actual validation will be done by normalizePhone().
  return /^[+\d][\d\s().-]{5,}$/.test(input);
}
