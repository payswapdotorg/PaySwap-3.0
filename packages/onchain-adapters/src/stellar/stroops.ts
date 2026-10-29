/**
 * @payswap/onchain-adapters — EXACT STROOP ARITHMETIC for the Stellar family
 * (P22-A, lane 3-a; ADR-0016 D2; INV-2 — no floating-point money).
 *
 * Horizon serves decimal amount strings; the Stellar minor unit is the STROOP
 * (1e-7 XLM, the exact 7-decimal scale). The conversion to integer stroops is
 * PURE STRING ARITHMETIC — no float ever touches money, and a lossy amount is
 * never fabricated.
 */

import { ValidationError } from '../errors.ts';

/** Exact non-negative integer decimal string (the minor-unit shape). */
export const EXACT_STROOPS = /^(0|[1-9][0-9]*)$/;

/** The pinned StrKey account shape (ADR-0016 D2/D9 — see onchain-domain). */
export const STRKEY_ACCOUNT = /^G[A-Z2-7]{55}$/;

/** Horizon decimal amounts: up to 7 fractional digits (the stroop scale). */
export const HORIZON_DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]{1,7})?$/;

/**
 * Converts a Horizon decimal amount string into EXACT integer stroops
 * (pure string arithmetic — no float, INV-2). More than 7 fractional
 * digits is a LOSSY shape and is rejected (an inexact amount is never
 * fabricated).
 */
export function stellarDecimalToStroops(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HORIZON_DECIMAL.test(value)) {
    throw new ValidationError(
      `${label} must be a Horizon decimal amount string with at most 7 fractional digits (exact stroops — no floating-point money), got '${String(value)}'`,
    );
  }
  const [whole, fractional = ''] = value.split('.');
  const paddedFraction = fractional.padEnd(7, '0');
  // Exact integer form: leading zeros of the combined digits are NOT value
  // ('0.0000001' is exactly 1 stroop, not '00000001') — normalize, never
  // fabricate a lossy shape.
  const stroops = `${whole}${paddedFraction}`.replace(/^0+(?=\d)/, '');
  // The normalized form must be an exact non-negative integer. Guard it.
  if (!EXACT_STROOPS.test(stroops)) {
    throw new ValidationError(
      `${label} '${value}' does not convert to exact integer stroops — a lossy observation is never fabricated`,
    );
  }
  return stroops;
}
