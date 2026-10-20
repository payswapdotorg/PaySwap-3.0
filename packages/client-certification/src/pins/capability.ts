/**
 * @payswap/client-certification — pinned wire shapes of the capability
 * fabric's eligibility model (P8-W2, lane p8-w2; commit 1/4).
 *
 * Authority: @payswap/capability (P2-W1, merged @ f9392a3). The
 * recipient-authorization gate certifies that a surface re-verifies
 * FRESH eligibility after a recipient change; the closed vocabularies
 * below are the ones that eligibility re-verification resolves into.
 * PINS ARE NOT IMPORTS.
 */

// ---------------------------------------------------------------------------
// Eligibility observations (closed vocabulary — never a bare boolean)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/capability src/observation.ts
 * `EligibilityObservation` (byte-identical closed vocabulary).
 */
export const PINNED_ELIGIBILITY_OBSERVATIONS = Object.freeze([
  "ELIGIBLE",
  "NOT_ELIGIBLE",
  "UNKNOWN",
] as const);

/** STRUCTURAL PIN — authority: @payswap/capability `EligibilityObservation`. */
export type PinnedEligibilityObservation =
  (typeof PINNED_ELIGIBILITY_OBSERVATIONS)[number];

// ---------------------------------------------------------------------------
// Authorization statuses (the connected-instance scope)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/capability
 * src/connected-instance.ts authorization `status` (byte-identical
 * closed vocabulary; INV-13: the connected instance is the only
 * authorization scope).
 */
export const PINNED_AUTHORIZATION_STATUSES = Object.freeze([
  "ACTIVE",
  "PENDING",
  "REVOKED",
  "EXPIRED",
  "UNKNOWN",
] as const);

/** STRUCTURAL PIN — authority: @payswap/capability authorization status. */
export type PinnedAuthorizationStatus =
  (typeof PINNED_AUTHORIZATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Two-axis availability (UNKNOWN is never success, never failure)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/capability src/availability.ts
 * `CAPABILITY_STATES` + `SOURCE_AVAILABILITIES` (byte-identical).
 */
export const PINNED_CAPABILITY_STATES = Object.freeze([
  "AVAILABLE",
  "DEGRADED",
  "UNAVAILABLE",
] as const);

export const PINNED_SOURCE_AVAILABILITIES = Object.freeze([
  "REACHABLE",
  "UNREACHABLE",
  "UNKNOWN",
] as const);

/** STRUCTURAL PIN — authority: @payswap/capability `EffectiveAvailability`. */
export type PinnedEffectiveAvailability =
  | "AVAILABLE"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "UNKNOWN";

/**
 * VALUE PIN — authority: @payswap/capability
 * `resolveEffectiveAvailability` (behaviour-identical; asserted by
 * test/pins.test.ts): REACHABLE -> the state governs; UNREACHABLE or
 * UNKNOWN -> UNKNOWN. The same law governs a surface displaying
 * eligibility after a recipient change: an unverifiable observation can
 * never display as success or failure.
 */
export function pinnedResolveEffectiveAvailability(
  state: (typeof PINNED_CAPABILITY_STATES)[number],
  source: (typeof PINNED_SOURCE_AVAILABILITIES)[number],
): PinnedEffectiveAvailability {
  switch (source) {
    case "REACHABLE":
      return state;
    case "UNREACHABLE":
      return "UNKNOWN";
    case "UNKNOWN":
      return "UNKNOWN";
  }
}
