/**
 * @payswap/opportunities — the pinned wire shapes of the economic model
 * kernel (P6-W2, lane r4-w2; commit 1/4).
 *
 * Authority: @payswap/economic (P1-W1 — the economic-layer sibling that
 * owns EconomicGoal, MoneyMovementIntent and the pinned cross-lane money
 * wire shape AmountSpec). The opportunities package is in the SAME
 * economic layer (MODULE-OWNERSHIP layer `economic`: goals, intents,
 * execution-graph, strategy, opportunities — may_depend_on [contracts]),
 * and it pins the sibling's wire shapes for exactly three reasons:
 *
 * - AMOUNT SPEC: the three-character-currency + canonical-integer-minor-
 *   units money wire (identical in the economic, protocol and trust
 *   lanes) is the shape an opportunity's FEE-BOUNDED estimates cite when
 *   they reference a numeraire — pinned verbatim, including the law that
 *   this package implements the wire SHAPE and its structural validation
 *   ONLY, never money arithmetic (INV-01 single financial authority).
 * - VERSIONED INPUTS: the authority's VersionedEconomicInput discipline
 *   (typed kind vocabulary + positive integer version + opaque sourceRef
 *   + explicit canonical-JSON content) is the ancestor law of this
 *   package's versioned SupportingObservation evidence; the kind
 *   vocabulary is pinned so an opportunity that cites a QUOTE or
 *   CORRIDOR detail as an economic input cites the authority's kinds.
 * - GOAL/INTENT LINEAGE: an opportunity is ADVISORY DEMAND-side evidence
 *   — it never establishes authorization or finality, and when it cites
 *   the goal it may serve, it cites the authority's intent archetypes
 *   (MONEY_MOVEMENT | PAYMENT | SERVICE_ACCESS) as an opaque lineage ref.
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
