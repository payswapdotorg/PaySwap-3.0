/**
 * @payswap/opportunities — evidence freshness (P6-W2, lane r4-w2).
 *
 * VALUE LAW (authority: @payswap/route-compiler src/quote.ts — the old
 * package consumed the best-execution law as-is; re-implemented locally
 * under the zero-sibling pins discipline, behaviour-identical, asserted
 * over the full boundary matrix by test/pins.test.ts): every piece of
 * evidence carries a BOUNDED window { asOfMs (non-negative), maxAgeMs
 * (POSITIVE — a boundless observation is not evidence) }; staleness is
 * DETERMINISTIC and INCLUSIVE at the bound (stale iff
 * (at − asOfMs) > maxAgeMs — fresh at exactly maxAge of age); the
 * evaluation instant is ALWAYS caller-supplied (no ambient clock).
 */

import { InvalidEvidenceError } from "./errors.ts";
import type { PinnedQuoteFreshness } from "./pins/route-compiler.ts";

/**
 * The evidence freshness wire shape (the pinned QuoteFreshness shape —
 * the bounded observation window every SupportingObservation carries).
 */
export type EvidenceFreshness = PinnedQuoteFreshness;

/**
 * Fail-closed validation of an EvidenceFreshness window (the authority's
 * validateQuoteFreshness law, behaviour-identical: maxAgeMs POSITIVE).
 */
export function validateEvidenceFreshness(
  candidate: unknown,
  subject: string,
): EvidenceFreshness {
  if (candidate === null || typeof candidate !== "object") {
    throw new InvalidEvidenceError(
      `${subject} must be an EvidenceFreshness window { asOfMs, maxAgeMs }`,
    );
  }
  const record = candidate as Partial<EvidenceFreshness>;
  const { asOfMs, maxAgeMs } = record;
  if (
    typeof asOfMs !== "number" ||
    !Number.isSafeInteger(asOfMs) ||
    asOfMs < 0
  ) {
    throw new InvalidEvidenceError(
      `${subject}.asOfMs must be a non-negative integer (the observation instant — no ambient clock)`,
    );
  }
  if (
    typeof maxAgeMs !== "number" ||
    !Number.isSafeInteger(maxAgeMs) ||
    maxAgeMs < 1
  ) {
    throw new InvalidEvidenceError(
      `${subject}.maxAgeMs must be a positive integer (a boundless observation is not evidence)`,
    );
  }
  return Object.freeze({ asOfMs, maxAgeMs });
}

/**
 * The deterministic staleness law: stale iff (at − asOfMs) > maxAgeMs —
 * fresh at exactly maxAge of age, stale one millisecond later (the
 * authority's isQuoteStale law, behaviour-identical). The evaluation
 * instant must be a non-negative safe integer; there is no ambient clock.
 */
export function isEvidenceStale(
  freshness: EvidenceFreshness,
  at: number,
): boolean {
  validateEvidenceFreshness(freshness, "freshness");
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new RangeError(
      "the evaluation instant must be a non-negative integer (no ambient clock)",
    );
  }
  return at - freshness.asOfMs > freshness.maxAgeMs;
}
