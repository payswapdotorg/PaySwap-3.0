/**
 * @payswap/opportunities — Knowable values (P6-W2, lane r4-w2; PORTED from
 * payswap.org@8a735bf packages/onchain-opportunities/src/model.ts, the
 * Knowable section — split into its own module under the 400-line file
 * law).
 *
 * A value that is KNOWN with its evidence, or honestly UNKNOWN with the
 * reason it is not knowable. Used for the maximum-loss bound ("WHERE
 * KNOWABLE"), capital requirements and fee schedules that the evidence
 * does not determine. UNKNOWN is honest disclosure, never failure and
 * never a guess — and never ineligibility (the policy surfaces UNKNOWN
 * states as FLAGS, see eligibility.ts).
 */

import { InvalidKnowableError } from "./errors.ts";

/**
 * A value that is KNOWN with its evidence, or honestly UNKNOWN with the
 * reason it is not knowable.
 */
export type Knowable<T> =
  | { readonly kind: "KNOWN"; readonly value: T }
  | { readonly kind: "UNKNOWN"; readonly reason: string };

/** Type guard for the KNOWN case. */
export function isKnown<T>(
  knowable: Knowable<T>,
): knowable is { kind: "KNOWN"; value: T } {
  return knowable.kind === "KNOWN";
}

/** Builds a KNOWN value (frozen). */
export function known<T>(value: T): Knowable<T> {
  return Object.freeze({ kind: "KNOWN", value });
}

/** Builds an honest UNKNOWN value with its reason (frozen, fail-closed). */
export function unknown<T>(reason: string): Knowable<T> {
  if (typeof reason !== "string" || reason.length === 0) {
    throw new InvalidKnowableError(
      "an UNKNOWN value requires a non-empty reason (honest disclosure — never a bare guess)",
    );
  }
  return Object.freeze({ kind: "UNKNOWN", reason });
}

/**
 * Fail-closed validation of a Knowable: KNOWN requires a value (validated
 * by the caller's own value validator); UNKNOWN requires a non-empty
 * reason; anything else is rejected — a knowable value is never guessed.
 */
export function validateKnowable<T>(
  knowable: Knowable<T>,
  label: string,
  validateValue: (value: T) => void,
): void {
  if (knowable === null || typeof knowable !== "object") {
    throw new InvalidKnowableError(
      `${label} must be a Knowable (KNOWN or UNKNOWN)`,
    );
  }
  const record = knowable as Partial<Knowable<T>>;
  if (record.kind === "KNOWN") {
    if (record.value === undefined) {
      throw new InvalidKnowableError(`${label}: KNOWN requires a value`);
    }
    validateValue(record.value);
  } else if (record.kind === "UNKNOWN") {
    if (typeof record.reason !== "string" || record.reason.length === 0) {
      throw new InvalidKnowableError(
        `${label}.reason must be a non-empty string (honest UNKNOWN — never guessed)`,
      );
    }
  } else {
    throw new InvalidKnowableError(
      `${label}.kind must be 'KNOWN' or 'UNKNOWN' — a knowable value is never guessed`,
    );
  }
}
