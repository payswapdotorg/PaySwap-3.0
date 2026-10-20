/**
 * @payswap/client-certification — pinned wire shapes of the experience
 * UI's design-contract vocabulary (P8-W2, lane p8-w2; commit 1/4).
 *
 * Authority: @payswap/ui src/payswap (P7 lanes, merged @ f9392a3). The
 * state-honesty and sandbox/live gates certify against the UI package's
 * own contract constants: the tone law (UNKNOWN never styled as
 * failure), the outcome-chip failure law, the environment-mark law
 * (test is an INVERTED stone mark — it can never read as error or
 * success) and the token version the contracts are pinned to. PINS ARE
 * NOT IMPORTS; the certification package owns no rendering.
 */

// ---------------------------------------------------------------------------
// The environment kinds (sandbox/live separation vocabulary)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/ui src/payswap/state-tokens.ts
 * `ENVIRONMENT_KINDS` (byte-identical). `test` is the sandbox tier;
 * `live` is the default world. The client-certification law uses the
 * same two-kind vocabulary — a surface state is pinned to one of these.
 */
export const PINNED_ENVIRONMENT_KINDS = Object.freeze([
  "test",
  "live",
] as const);

/** STRUCTURAL PIN — authority: @payswap/ui `EnvironmentKind`. */
export type PinnedEnvironmentKind = (typeof PINNED_ENVIRONMENT_KINDS)[number];

/**
 * VALUE PIN — authority: @payswap/ui src/payswap/contracts.ts
 * `EnvironmentMarkContract.testMarkIsInvertedStone` (byte-identical
 * law): the inverted-stone mark exists so TEST can never read as error
 * or success.
 */
export const PINNED_TEST_MARK_IS_INVERTED_STONE = true as const;

// ---------------------------------------------------------------------------
// The tone law (UNKNOWN is never styled as failure)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/ui src/payswap/tokens.ts
 * `STATUS_TONES` (byte-identical closed vocabulary, canonical order).
 */
export const PINNED_STATUS_TONES = Object.freeze([
  "ok",
  "attention",
  "unknown",
  "blocked",
  "disabled",
  "failed",
] as const);

/** STRUCTURAL PIN — authority: @payswap/ui `StatusTone`. */
export type PinnedStatusTone = (typeof PINNED_STATUS_TONES)[number];

/**
 * VALUE PIN — authority: @payswap/ui src/payswap/contracts.ts
 * `HonestToneContract` (behaviour-identical): `unknownTone` MUST be
 * `unknown`; only `blocked` and `failed` may consume the danger ramp.
 */
export const PINNED_UNKNOWN_TONE = "unknown" as const;

export const PINNED_DANGER_TONES = Object.freeze([
  "blocked",
  "failed",
] as const);

/** STRUCTURAL PIN — authority: @payswap/ui danger-ramp membership. */
export type PinnedDangerTone = (typeof PINNED_DANGER_TONES)[number];

// ---------------------------------------------------------------------------
// The outcome-chip states (consequential display vocabulary)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/ui src/payswap/state-tokens.ts
 * `OUTCOME_STATES` (byte-identical closed vocabulary, canonical order).
 */
export const PINNED_OUTCOME_CHIP_STATES = Object.freeze([
  "succeeded",
  "processing",
  "failed",
  "refunded",
  "partially_refunded",
  "disputed",
  "blocked",
  "dropped",
] as const);

/** STRUCTURAL PIN — authority: @payswap/ui `OutcomeState`. */
export type PinnedOutcomeChipState = (typeof PINNED_OUTCOME_CHIP_STATES)[number];

// ---------------------------------------------------------------------------
// The token contract version (drift detection)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/ui src/payswap/tokens.ts
 * `TOKEN_VERSION` (byte-identical). A certified experience surface that
 * consumes design tokens declares the token contract version it was
 * verified against; drift is a re-verification trigger, never silent.
 */
export const PINNED_DESIGN_TOKEN_VERSION = "1.1.0" as const;
