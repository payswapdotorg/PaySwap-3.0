/**
 * @payswap/route-compiler — exact conversion grounding (P5-W1).
 *
 * PORT of the old compiler's FiatConversionRule + convertAmount block
 * (MMI-19): FX is NEVER invented by the compiler — every currency
 * crossing grounds on a DECLARED conversion rule (a peg declaration, a
 * policy — never a market guess):
 *
 * - a rule is an exact rational (toCurrency minor units per ONE
 *   fromCurrency minor unit) with a ruleId and a declaredBy source;
 * - convertAmount finds the rule for the pair (rules canonically sorted
 *   by ruleId — deterministic under permutation), applies the exact
 *   rational and floors ONCE at the boundary;
 * - a missing rule or a ZERO result is surfaced as an UNKNOWN basis
 *   with an honest reason — an unusable grounding is never rounded up
 *   (the old law, preserved).
 */

import { deepFreeze, sortedBy } from "./canonical.ts";
import { compareMinorUnits } from "./amount.ts";
import { valueThroughRate, type ExactRational } from "./exact-math.ts";
import type { AmountSpec } from "./amount.ts";
import type { PlannedLegAmount } from "./planned-amount.ts";

/** An exact conversion grounding between two currencies. */
export interface FiatConversionRule {
  readonly ruleId: string;
  readonly fromCurrency: string;
  readonly toCurrency: string;
  /** Exact rational: toCurrency minor units per fromCurrency minor unit. */
  readonly rate: ExactRational;
  /** The grounding source that declares this rate (never the compiler). */
  readonly declaredBy: string;
}

/** Canonically order conversion rules (by ruleId — the replay law). */
export function sortedConversionRules(
  rules: readonly FiatConversionRule[],
): readonly FiatConversionRule[] {
  return sortedBy(rules, (rule) => rule.ruleId);
}

/**
 * Convert an amount through the declared rules: exact-rational
 * application with a single floor; UNKNOWN basis with an honest reason
 * when the pair is ungrounded or the result is zero. Deterministic
 * under input permutation (rules sorted by ruleId before the search).
 */
export function convertAmount(
  amount: AmountSpec,
  rules: readonly FiatConversionRule[],
  toCurrency: string,
): PlannedLegAmount {
  const ordered = sortedConversionRules(rules);
  const rule = ordered.find(
    (candidate) => candidate.fromCurrency === amount.currency && candidate.toCurrency === toCurrency,
  );
  if (rule === undefined) {
    return Object.freeze({
      basis: "UNKNOWN",
      reason: `no declared conversion rule grounds '${amount.currency}' -> '${toCurrency}' — the compiler never invents FX`,
    });
  }
  const convertedMinor = valueThroughRate(amount.minorUnits, rule.rate);
  if (convertedMinor === "0") {
    return Object.freeze({
      basis: "UNKNOWN",
      reason: `the declared conversion rule '${rule.ruleId}' grounds '${amount.currency}' -> '${toCurrency}' to zero — an unusable grounding is surfaced, never rounded up`,
    });
  }
  return Object.freeze({
    basis: "CONVERSION_GROUNDED",
    amount: Object.freeze({ currency: toCurrency, minorUnits: convertedMinor }),
    ruleId: rule.ruleId,
  });
}

/** True iff the converted basis is grounded (honest narrowing helper). */
export function conversionIsGrounded(planned: PlannedLegAmount): planned is {
  basis: "CONVERSION_GROUNDED";
  amount: AmountSpec;
  ruleId: string;
} {
  return planned.basis === "CONVERSION_GROUNDED";
}

/** Exact comparison of two amounts' minor units (currency-agnostic helper). */
export function minorUnitsAtLeast(amount: AmountSpec, minimumMinor: string): boolean {
  return compareMinorUnits(amount.minorUnits, minimumMinor) >= 0;
}
