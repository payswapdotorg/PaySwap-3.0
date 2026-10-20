/**
 * @payswap/opportunities — the pinned wire shapes of the economic model
 * kernel (P6-W2, lane r4-w2; commit 1/4).
 *
 * Authority: @payswap/economic (P1-W1 — the economic-layer sibling; this
 * package is in the SAME layer). Pinned: AMOUNT SPEC (the cross-lane
 * money wire — SHAPE and structural validation only, never money
 * arithmetic: INV-01); VERSIONED INPUTS (the kind vocabulary that is the
 * ancestor law of the versioned SupportingObservation evidence);
 * GOAL/INTENT LINEAGE (the intent archetypes an opportunity cites as an
 * ADVISORY lineage ref — never authorization, never finality).
 */

/**
 * VALUE PIN — authority: @payswap/economic src/amount-spec.ts
 * `AmountSpec` (the pinned cross-lane money wire shape — verbatim):
 *
 *   interface AmountSpec {
 *     readonly currency: string;   // /^[A-Z]{3}$/
 *     readonly minorUnits: string; // /^(0|[1-9][0-9]*)$/
 *   }
 *
 * Fiat ISO-style and onchain symbols share the SAME shape. This package
 * declares the shape STRUCTURALLY (parallel-lane self-containment; the
 * duplicate-type risk is ACCEPTED and TL-reconciled at integration,
 * exactly as the authority itself records against @payswap/trust).
 */
export interface PinnedAmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}

/**
 * VALUE PIN — authority: @payswap/economic src/amount-spec.ts — the
 * currency-code pattern (/^[A-Z]{3}$/) and the minor-unit pattern
 * (/^(0|[1-9][0-9]*)$/), byte-identical.
 */
export const PINNED_CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * VALUE PIN — authority: @payswap/economic src/versioned-input.ts
 * `ECONOMIC_INPUT_KINDS` (byte-identical closed vocabulary). An
 * opportunity's advisory economic inputs cite the authority's kinds.
 */
export const PINNED_ECONOMIC_INPUT_KINDS = Object.freeze([
  "QUOTE",
  "CORRIDOR",
  "FX_RATE",
  "MARKET_DATA",
  "OTHER",
] as const);

/** STRUCTURAL PIN — authority: @payswap/economic `EconomicInputKind`. */
export type PinnedEconomicInputKind =
  (typeof PINNED_ECONOMIC_INPUT_KINDS)[number];

/**
 * STRUCTURAL PIN — authority: @payswap/economic src/versioned-input.ts
 * `VersionedEconomicInput` (SUBSET: kind + positive integer version +
 * opaque sourceRef; the authority's content field is canonical JSON text
 * owned by the authority's digest discipline — opaque here).
 */
export interface PinnedVersionedEconomicInput {
  readonly kind: PinnedEconomicInputKind;
  /** Positive integer pinning the content's schema/semantics. */
  readonly version: number;
  /** Opaque observation-lineage reference (never authority). */
  readonly sourceRef: string;
}

/**
 * VALUE PIN — authority: @payswap/economic src/intent.ts
 * `INTENT_ARCHETYPES` = ["MONEY_MOVEMENT", "PAYMENT", "SERVICE_ACCESS"]
 * (byte-identical). An opportunity cites the archetype it may serve as an
 * ADVISORY lineage ref only — the authority's demand model, never an
 * authorization to move anything.
 */
export const PINNED_INTENT_ARCHETYPES = Object.freeze([
  "MONEY_MOVEMENT",
  "PAYMENT",
  "SERVICE_ACCESS",
] as const);

/** STRUCTURAL PIN — authority: @payswap/economic `IntentArchetype`. */
export type PinnedIntentArchetype = (typeof PINNED_INTENT_ARCHETYPES)[number];

/**
 * STRUCTURAL PIN — authority: @payswap/economic src/goal.ts
 * `EconomicGoal` (SUBSET, nominal only): the advisory demand record an
 * opportunity may cite as the demand it is evidence FOR. The authority's
 * full shape (outcome demands, constraints, recourse, proof
 * requirements, versioned economic inputs) is the economic kernel's law
 * — opaque here; this pin exists so the lineage reference is typed, not
 * a bare string.
 */
export interface PinnedEconomicGoalRef {
  /** The authority's EconomicGoal id (opaque lineage ref). */
  readonly goalId: string;
  /** The authority's goal schema version (positive integer). */
  readonly version: number;
}
