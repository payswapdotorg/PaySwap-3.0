/**
 * @payswap/surface — exact integer minor-unit money display (P2-W3).
 *
 * ADAPT of payswap.org@8a735bf packages/surface/src/money-view.ts (88L).
 * Old-repo provenance: Work Order P4-W4-002 §3 money law; INV-F01 ->
 * canonical INV-02 (exact/lossless money) at the DISPLAY boundary.
 *
 * PORTED LAW (unchanged): every money amount crossing the surface is INTEGER
 * MINOR UNITS + a currency code. This module renders human display strings
 * with INTEGER ARITHMETIC ONLY: division by the minor-unit base is done on
 * the bigint absolute value with an exact zero-padded remainder — a binary
 * float never touches the amount (INV-02 discipline; floats are structurally
 * rejected upstream by the wire pin).
 *
 * ADAPTATION (the old runtime import is NOT ported): the old module resolved
 * minor-unit digits through @payswap/protocol's getCurrencyInfo (a runtime
 * dependency). PaySwap 3.0's surface is layer `contracts` with ZERO runtime
 * dependencies (MODULE-OWNERSHIP contracts may_depend_on [contracts]; sibling
 * financial imports are forbidden) — so currency metadata and locale data
 * are now EXPLICIT INPUTS (MoneyDisplayInput). The library never reads an
 * ambient locale, registry, clock or environment: determinism by
 * construction (work-order hard constraint).
 *
 * The honest labeled fallback is PORTED verbatim: an unregistered code
 * assumes 2 digits AND THE OUTPUT SAYS SO — a caller can never mistake a
 * default for registry truth.
 */

import { requireSurfaceAmountSpec, type AmountSpec } from "./amount-spec.ts";

/** How a currency's minor-unit digits were resolved (honest, labeled). */
export type MinorUnitDigitsSource =
  | { readonly kind: "input-registry"; readonly code: string; readonly digits: number }
  | { readonly kind: "fallback-assumed-2"; readonly code: string; readonly digits: 2 };

/** Explicit display-locale data — never read from the environment. */
export interface DisplayLocaleInput {
  /** Thousands grouping separator. Default: "," (library default, deterministic). */
  readonly thousandsSeparator?: string;
  /** Decimal separator. Default: "." (library default, deterministic). */
  readonly decimalSeparator?: string;
  /** Digits per thousands group. Default: 3. */
  readonly groupSize?: number;
}

/**
 * All display context as EXPLICIT INPUTS: currency minor-unit digits and
 * locale data. No ambient Intl, no clock, no environment reads anywhere in
 * this library (machine-checked by the boundary test).
 */
export interface MoneyDisplayInput {
  /** Caller-provided currency -> minor-unit digits. Unlisted codes get the honest labeled 2-digit fallback. */
  readonly currencyDigits?: ReadonlyMap<string, number>;
  /** Locale display data; defaults are deterministic library constants (documented, never ambient). */
  readonly locale?: DisplayLocaleInput;
}

const DEFAULT_THOUSANDS = ",";
const DEFAULT_DECIMAL = ".";
const DEFAULT_GROUP_SIZE = 3;

/** Resolve minor-unit digits through the EXPLICIT input, honestly. */
export function resolveMinorUnitDigits(
  code: string,
  input: Pick<MoneyDisplayInput, "currencyDigits"> = {},
): MinorUnitDigitsSource {
  // Currency codes are canonically uppercase (ISO 4217); the lookup
  // normalizes the case — a formatting concern, not a registry mutation.
  const normalized = code.trim().toUpperCase();
  const provided = input.currencyDigits?.get(normalized);
  if (provided !== undefined) {
    if (!Number.isInteger(provided) || provided < 0 || provided > 18) {
      throw new Error(
        `resolveMinorUnitDigits: digits for ${normalized} must be an integer in [0, 18], got ${String(provided)}`,
      );
    }
    return { kind: "input-registry", code: normalized, digits: provided };
  }
  return { kind: "fallback-assumed-2", code: normalized, digits: 2 };
}

/**
 * Format an integer minor-unit amount as an exact human display string.
 *
 * `minorUnits` accepts bigint or an integer-valued string (the wire form);
 * anything non-integer or malformed throws — the formatter is a display
 * function over EXACT values, never a parser that silently rounds.
 * Negative values are display-only (net positions); the WIRE form
 * (AmountSpec) cannot carry a sign.
 */
export function formatMinorUnits(
  minorUnits: bigint | string,
  currencyCode: string,
  input: MoneyDisplayInput = {},
): string {
  let value: bigint;
  if (typeof minorUnits === "bigint") {
    value = minorUnits;
  } else {
    const trimmed = minorUnits.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw new Error(
        `formatMinorUnits: minor units must be an integer (bigint or integer string), got ${JSON.stringify(minorUnits)}`,
      );
    }
    value = BigInt(trimmed);
  }
  const source = resolveMinorUnitDigits(currencyCode, input);
  const digits = source.digits;
  const locale = input.locale ?? {};
  const thousands = locale.thousandsSeparator ?? DEFAULT_THOUSANDS;
  const decimal = locale.decimalSeparator ?? DEFAULT_DECIMAL;
  const groupSize = locale.groupSize ?? DEFAULT_GROUP_SIZE;
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(digits);
  const whole = absolute / base;
  const fraction = absolute % base;
  const fractionText = digits > 0 ? `${decimal}${fraction.toString().padStart(digits, "0")}` : "";
  const sign = negative ? "−" : "";
  const grouped = groupThousands(whole.toString(), groupSize, thousands);
  const suffix =
    source.kind === "fallback-assumed-2" ? " (unregistered code — 2 digits assumed)" : "";
  return `${sign}${grouped}${fractionText} ${currencyCode.toUpperCase()}${suffix}`;
}

/** Group an integer string in explicit sizes with an explicit separator (integer string slicing only — no number ops). */
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
 * Format a WIRE AmountSpec (the pinned non-negative form) as an exact human
 * display string. Fail-closed: the amount is structurally validated through
 * the pin first; a malformed wire amount can never reach the display path.
 */
export function formatMoneyAmount(amount: AmountSpec, input: MoneyDisplayInput = {}): string {
  const validated = requireSurfaceAmountSpec(amount, "formatMoneyAmount");
  return formatMinorUnits(validated.minorUnits, validated.currency, input);
}

/** Grouping-agnostic machine key for tables/sorting (never for display). */
export function minorUnitsSortKey(minorUnits: bigint, currencyCode: string): string {
  return `${currencyCode.toUpperCase()}|${minorUnits.toString().padStart(24, "0")}`;
}
