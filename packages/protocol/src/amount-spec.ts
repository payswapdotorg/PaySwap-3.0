/**
 * @payswap/protocol — AmountSpec bridge (P1-W2).
 *
 * The pinned cross-lane money wire format, byte-identical to the pin held by
 * the trust lane (packages/trust/src/amount-spec.ts, accepted P1-W3) and
 * recorded in the Phase-1 dispatch:
 *
 *   interface AmountSpec {
 *     readonly currency: string;
 *     readonly minorUnits: string;
 *   }
 *
 * - `currency` matches /^[A-Z]{3}$/ — fiat ISO-style and onchain symbols
 *   share the shape.
 * - `minorUnits` is a canonical non-negative decimal integer string matching
 *   /^(0|[1-9][0-9]*)$/ — no sign, no decimal point, no exponent, no
 *   leading zeros except "0".
 *
 * SINGLE-OWNER LAW (INV-01 — one Financial Protocol Authority): the trust
 * lane owns the wire TYPE and its structural validation; THIS package owns
 * exact-integer money SEMANTICS and the AmountSpec -> Money bridge. The
 * structural declaration below is pinned locally (identical shape) so this
 * package stays dependency-free in flight; the TL swaps the type import to
 * `@payswap/trust` at integration without touching any semantics.
 *
 * Money constructed through this bridge is NON-NEGATIVE by construction
 * (the wire format cannot carry a sign); negative money exists only inside
 * protocol arithmetic.
 */

import { ValidationError } from './errors.ts';
import { currencyCode, fromMinorUnits } from './money.ts';
import type { Money } from './money.ts';

/** Exact monetary amount on the wire: integer minor units as a canonical decimal string. */
export interface AmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*)$/;

/** Raised when an AmountSpec is structurally invalid. */
export class InvalidAmountError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

/**
 * Structural validation of the pinned wire format (semantics identical to
 * the trust lane's validateAmountSpec — one shape, two pinned declarations).
 */
export function validateAmountSpec(amount: AmountSpec): void {
  if (amount === null || typeof amount !== 'object') {
    throw new InvalidAmountError('amount must be an AmountSpec object');
  }
  if (typeof amount.currency !== 'string' || !CURRENCY_PATTERN.test(amount.currency)) {
    throw new InvalidAmountError(
      `currency must be a 3-letter uppercase code, got '${String(amount.currency)}'`,
    );
  }
  if (typeof amount.minorUnits !== 'string' || !MINOR_UNITS_PATTERN.test(amount.minorUnits)) {
    throw new InvalidAmountError(
      `minorUnits must be a non-negative integer decimal string, got '${String(amount.minorUnits)}'`,
    );
  }
}

/** Type predicate form of validateAmountSpec for inbound wire data. */
export function isValidAmountSpec(amount: AmountSpec): boolean {
  try {
    validateAmountSpec(amount);
    return true;
  } catch {
    return false;
  }
}

/**
 * THE BRIDGE: parse an AmountSpec into exact Money.
 *
 * Beyond the structural pin, the currency must be REGISTERED in the
 * financial lane's currency registry (minor-unit semantics live here, not in
 * the wire type — `UnknownCurrencyError` for unregistered codes). The
 * resulting Money is non-negative and exact: the decimal string is converted
 * with BigInt, never through a float.
 */
export function amountSpecToMoney(amount: AmountSpec): Money {
  validateAmountSpec(amount);
  return fromMinorUnits(currencyCode(amount.currency), BigInt(amount.minorUnits));
}

/**
 * THE BRIDGE (reverse): serialize exact Money into the pinned wire format.
 *
 * - the money must be NON-NEGATIVE (the wire format carries no sign; carry
 *   direction at a higher protocol level, never a signed wire amount);
 * - the currency is emitted verbatim (registered by construction);
 * - `minorUnits` is rendered as the canonical decimal string of the bigint.
 */
export function moneyToAmountSpec(money: Money): AmountSpec {
  if (money === null || typeof money !== 'object' || typeof money.value !== 'bigint') {
    throw new ValidationError('money must be an exact Money object (INV-02)');
  }
  if (money.value < 0n) {
    throw new ValidationError(
      'negative money cannot be serialized to AmountSpec — the wire format is non-negative',
      { currency: money.currency, value: money.value.toString() },
    );
  }
  return Object.freeze({ currency: money.currency, minorUnits: money.value.toString(10) });
}

/** Round-trip guard: parse(serialize(m)) === m for non-negative m. */
export function roundTripsThroughWire(money: Money): boolean {
  const spec = moneyToAmountSpec(money);
  const back = amountSpecToMoney(spec);
  return back.currency === money.currency && back.value === money.value;
}
