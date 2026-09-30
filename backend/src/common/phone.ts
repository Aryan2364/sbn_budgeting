import { UnprocessableEntityException } from '@nestjs/common';

/**
 * Phones are stored as their last ten digits (CONTRACT section 2), so
 * "+91 98250 12345", "098250 12345" and "9825012345" are one person.
 * The unique index in 0009 compares the same way; this is what keeps
 * the stored value tidy and the error readable.
 */
export function phoneDigits(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return null;
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** Normalises, or 422 with the reason. Blank means "no phone". */
export function normalisePhone(raw: string | null | undefined): string | null {
  const value = phoneDigits(raw);
  if (value === null) return null;
  if (value.length < 10) {
    throw new UnprocessableEntityException(
      `"${raw}" is not a full phone number. Enter all 10 digits, like 98250 12345.`,
    );
  }
  return value;
}

/**
 * The SQL twin of phoneDigits, for comparing against stored rows. The
 * same expression as the users_phone_unique index in 0009, so the
 * planner can use it. `\\D` because a template literal turns a lone
 * `\D` into a plain `D`, which would strip the letter D instead.
 */
export const PHONE_SQL = (column: string): string =>
  `right(regexp_replace(${column}, '\\D', '', 'g'), 10)`;
