/**
 * PaySwap Desktop (P7-W2) — exact integer minor-unit money display.
 *
 * Composes the pinned money-view contract (surface.money-view): every
 * money amount crossing the desktop product is INTEGER MINOR UNITS + a
 * currency code, rendered with INTEGER ARITHMETIC ONLY — division by the
 * minor-unit base is done on the bigint absolute value with an exact
 * zero-padded remainder; a binary float never touches the amount.
 *
 * Locale data and currency digits are EXPLICIT INPUTS (no ambient Intl,
 * no registry): an unregistered code assumes 2 digits AND THE OUTPUT SAYS
 * SO — a caller can never mistake a default for registry truth. The
 * output string mirrors the surface contract's exact display shape
 * ("grouped fraction CODE" + the honest fallback suffix).
 */

import type {
  PinnedAmountSpec,
  PinnedDisplayLocaleInput,
  PinnedMinorUnitDigitsSource,
  PinnedMoneyDisplayInput,
} from "../pins/index.js";
import { validatePinnedAmountSpec } from "../pins/index.js";

const DEFAULT_THOUSANDS = ",";
const DEFAULT_DECIMAL = ".";
const DEFAULT_GROUP_SIZE = 3;

/** Resolve minor-unit digits through the EXPLICIT input, honestly. */
export function resolveDesktopMinorUnitDigits(
  code: string,
  input: Pick<PinnedMoneyDisplayInput, "currencyDigits"> = {},
): PinnedMinorUnitDigitsSource {
  const normalized = code.trim().toUpperCase();
  const provided = input.currencyDigits?.get(normalized);
  if (provided !== undefined) {
    if (!Number.isInteger(provided) || provided < 0 || provided > 18) {
      throw new Error(
        `resolveDesktopMinorUnitDigits: digits for ${normalized} must be an integer in [0, 18], got ${String(provided)}`,
      );
    }
    return { kind: "input-registry", code: normalized, digits: provided };
  }
  return { kind: "fallback-assumed-2", code: normalized, digits: 2 };
}

/**
 * Group an integer string in explicit sizes with an explicit separator
 * (integer string slicing only — no number ops). Mirrors the surface
 * contract's grouping helper.
 */
function groupThousands(wholeText: string, groupSize: number, thousands: string): string {
  if (groupSize <= 0 || wholeText.length <= groupSize) {
    return wholeText;
  }
  const out: string[] = [];
  for (let end = wholeText.length; end > 0; end -= groupSize) {
    const start = Math.max(0, end - groupSize);
    out.push(wholeText.slice(start, end));
    if (start === 0) break;
  }
  return out.reverse().join(thousands);
}

/**
 * Format a WIRE AmountSpec (the pinned non-negative form) as an exact
 * human display string. Fail-closed: the amount is structurally validated
 * through the pin first; a malformed wire amount can never reach the
 * display path. Integer arithmetic only (bigint base division with exact
 * zero-padded remainder).
 */
export function formatDesktopMoneyAmount(
  amount: PinnedAmountSpec,
  input: PinnedMoneyDisplayInput = {},
): string {
  validatePinnedAmountSpec(amount);
  const source = resolveDesktopMinorUnitDigits(amount.currency, input);
  const digits = source.digits;
  const locale: PinnedDisplayLocaleInput = input.locale ?? {};
  const thousands = locale.thousandsSeparator ?? DEFAULT_THOUSANDS;
  const decimal = locale.decimalSeparator ?? DEFAULT_DECIMAL;
  const groupSize = locale.groupSize ?? DEFAULT_GROUP_SIZE;

  const absolute = BigInt(amount.minorUnits);
  const base = 10n ** BigInt(digits);
  const whole = absolute / base;
  const fraction = absolute % base;
  const fractionText =
    digits > 0 ? `${decimal}${fraction.toString().padStart(digits, "0")}` : "";
  const grouped = groupThousands(whole.toString(), groupSize, thousands);
  const suffix =
    source.kind === "fallback-assumed-2" ? " (unregistered code — 2 digits assumed)" : "";
  return `${grouped}${fractionText} ${amount.currency.toUpperCase()}${suffix}`;
}
