/**
 * @payswap/client-certification — pinned wire shapes of the experience
 * surface package (P8-W2, lane p8-w2; commit 1/4).
 *
 * Authority: @payswap/surface (P2-W3, merged @ f9392a3). This package
 * CERTIFIES customer-facing surface contracts; the shapes below are the
 * versioned vocabularies a certified surface is checked against. PINS
 * ARE NOT IMPORTS (the leaf-in-flight law): the TL wires the real types
 * at integration; the pin mirrors only what this package's gates
 * consume, byte-identical where marked VALUE PIN.
 */

// ---------------------------------------------------------------------------
// The five outcome actions (dead-action audit anchor vocabulary)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/surface src/outcomes.ts
 * `OutcomeActionId` (byte-identical closed vocabulary).
 */
export const PINNED_OUTCOME_ACTION_IDS = Object.freeze([
  "pay",
  "receive",
  "move",
  "convert",
  "checkout",
] as const);

/** STRUCTURAL PIN — authority: @payswap/surface `OutcomeActionId`. */
export type PinnedOutcomeActionId = (typeof PINNED_OUTCOME_ACTION_IDS)[number];

// ---------------------------------------------------------------------------
// The eleven operational areas (area-map completeness law)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/surface src/areas.ts
 * `UniversalAreaId` (byte-identical closed vocabulary, canonical order).
 */
export const PINNED_UNIVERSAL_AREA_IDS = Object.freeze([
  "overview",
  "payments",
  "accounts",
  "activity",
  "opportunities",
  "connections",
  "capabilities",
  "security",
  "reports",
  "developers",
  "settings",
] as const);

/** STRUCTURAL PIN — authority: @payswap/surface `UniversalAreaId`. */
export type PinnedUniversalAreaId = (typeof PINNED_UNIVERSAL_AREA_IDS)[number];

// ---------------------------------------------------------------------------
// Stage statuses (UNKNOWN is first-class — INV-04 at the UX boundary)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/surface src/progress-states.ts
 * `StageStatus` (byte-identical; UNKNOWN never converts to FAILED).
 */
export const PINNED_STAGE_STATUSES = Object.freeze([
  "ACHIEVED",
  "IN_PROGRESS",
  "PENDING",
  "UNKNOWN",
  "FAILED",
  "NOT_APPLICABLE",
] as const);

/** STRUCTURAL PIN — authority: @payswap/surface `StageStatus`. */
export type PinnedStageStatus = (typeof PINNED_STAGE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Authorization-change kinds (recipient-change law anchor vocabulary)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/surface src/authorization-changes.ts
 * `AUTHORIZATION_CHANGE_KINDS` (byte-identical closed vocabulary).
 */
export const PINNED_AUTHORIZATION_CHANGE_KINDS = Object.freeze([
  "QUOTE_EXPIRED",
  "QUOTE_TERMS_CHANGED",
  "RECIPIENT_CHANGED",
  "AMOUNT_CHANGED",
  "FUNDING_METHOD_CHANGED",
  "PROVIDER_OBSERVATION_CHANGED",
  "SECURITY_EPOCH_ADVANCED",
  "MANDATE_REVOKED",
] as const);

/** STRUCTURAL PIN — authority: @payswap/surface `AuthorizationChangeKind`. */
export type PinnedAuthorizationChangeKind =
  (typeof PINNED_AUTHORIZATION_CHANGE_KINDS)[number];

// ---------------------------------------------------------------------------
// Quote freshness (stale-display law anchor vocabulary)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/surface src/quote-terms.ts
 * `QuoteFreshness` status arms (byte-identical; EXPIRED means the quoted
 * terms are no longer offered — a fresh quote is required).
 */
export const PINNED_QUOTE_FRESHNESS_STATUSES = Object.freeze([
  "VALID",
  "EXPIRED",
] as const);

/** STRUCTURAL PIN — authority: @payswap/surface `QuoteFreshness` statuses. */
export type PinnedQuoteFreshnessStatus =
  (typeof PINNED_QUOTE_FRESHNESS_STATUSES)[number];

/**
 * VALUE PIN — authority: @payswap/surface INV-24 law (no fabricated
 * provider effects): the fail-closed guard phrase every honest surface
 * contract cites. Rendered verbatim by the state-honesty gate when a
 * surface claims success without evidence.
 */
export const PINNED_NO_FABRICATED_EFFECTS_NOTE =
  "no fabricated provider effects (INV-24)" as const;
