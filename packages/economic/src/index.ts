/**
 * @payswap/economic — the economic model kernel (Work Order P1-W1).
 *
 * LAYER LAW (spec/architecture/MODULE-OWNERSHIP.yaml layer `economic`):
 * may_depend_on [contracts] only; must_not_depend_on ui, model-runtime,
 * provider-sdk. As an authoring discipline this package is a LEAF: zero
 * runtime dependencies, zero non-relative imports in src/**, and NO
 * @payswap/* imports (parallel-lane self-containment — the TL wires
 * integration after acceptance; in particular @payswap/trust owns the
 * authoritative AmountSpec wire type and @payswap/protocol owns exact
 * money semantics, both pinned here structurally and reconciled by the TL).
 *
 * SURFACE:
 * - AmountSpec (pinned wire shape) + structural validation — NO money
 *   arithmetic (INV-01 single financial authority);
 * - EconomicGoal (net-new per GAP-01), GoalOutcome demands, recourse and
 *   proof requirements, versioned economic inputs;
 * - EconomicProgram (recurring/parameterized envelope) + deterministic
 *   expansion;
 * - MoneyMovementIntent (rail/provider-neutral ADAPT, MMI-02),
 *   ServiceAccessIntent (spec-only old concept, net-new code),
 *   PaymentIntent (type-level specialization ONLY — payment-method
 *   machinery is P5-W3), IntentArchetype;
 * - deterministic candidate compilation into versioned CandidateSkeleton
 *   graphs (NOT the EEG — P3-W2; routing/scoring are P5-W1).
 *
 * ADVISORY DEMAND ONLY: nothing exported from this package establishes
 * authorization (trust lane) or financial finality (protocol lane); types
 * carry opaque lineage refs for that wiring, never the authority itself.
 */

export const PACKAGE_NAME = "@payswap/economic" as const;

export * from "./errors.ts";
export * from "./digest.ts";
export * from "./amount-spec.ts";
export * from "./intent.ts";
export * from "./service-intent.ts";
export * from "./payment-intent.ts";
export * from "./recourse.ts";
export * from "./goal-outcome.ts";
export * from "./versioned-input.ts";
export * from "./goal.ts";
export * from "./program.ts";
export * from "./candidate.ts";
export * from "./compiler.ts";
