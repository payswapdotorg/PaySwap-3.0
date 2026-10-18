/**
 * @payswap/onchain-domain — the PINNED WIRE SHAPES of the settlement
 * machinery (P4-W1, lane R2-W1).
 *
 * HARD BOUNDARY (the settlement-mapping law): onchain state enters PaySwap
 * ONLY as observations mapped into the CANONICAL settlement machinery owned
 * by the Financial Protocol Authority (@payswap/protocol — INV-1: One
 * Financial Protocol Authority). This package owns NO ledger, NO balance,
 * NO settlement state and NO finality: it owns the MAPPING VOCABULARY that
 * hands onchain observations to the settlement plane. The machinery shapes
 * referenced by the mapping (attempt states/events, the IN_FLIGHT
 * transition table, the OUTCOME_UNKNOWN exit law) are re-declared here as
 * LOCAL SUBSET-TYPED STRUCTURAL PINS with authority-naming doc comments
 * (v1 hermetic: zero sibling imports). Vocabulary VALUES are pinned
 * byte-identical to the authority lane and cross-lane consistency is
 * asserted by test/pins.test.ts.
 *
 * Canonical citations: INV-4 (UNKNOWN is not FAILED and is reconciled
 * rather than blindly retried — OUTCOME_UNKNOWN only exits through the
 * reconciliation resolution events); INV-1 (finality is protocol-owned — a
 * finality record id may only be REFERENCED, never constructed, here).
 */

// ---------------------------------------------------------------------------
// The settlement attempt lifecycle pins
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/protocol src/settlement/attempts.ts
 * `SettlementAttemptState` (byte-identical). SUCCEEDED and FAILED are
 * TERMINAL and monotonic: a retry mints a NEW attempt record — the failed
 * record is never rewritten.
 */
export const PINNED_SETTLEMENT_ATTEMPT_STATES = [
  "PENDING",
  "IN_FLIGHT",
  "OUTCOME_UNKNOWN",
  "SUCCEEDED",
  "FAILED",
] as const;

/** STRUCTURAL PIN — authority: @payswap/protocol `SettlementAttemptState`. */
export type PinnedSettlementAttemptState =
  (typeof PINNED_SETTLEMENT_ATTEMPT_STATES)[number];

/**
 * VALUE PIN — authority: @payswap/protocol
 * src/settlement/attempts.ts `SettlementAttemptEvent` (byte-identical).
 */
export const PINNED_SETTLEMENT_ATTEMPT_EVENTS = [
  "START",
  "CONFIRM_SUCCEEDED",
  "CONFIRM_FAILED",
  "OUTCOME_UNKNOWN",
  "RECONCILE_RESOLVED_SUCCEEDED",
  "RECONCILE_RESOLVED_FAILED",
] as const;

/** STRUCTURAL PIN — authority: @payswap/protocol `SettlementAttemptEvent`. */
export type PinnedSettlementAttemptEvent =
  (typeof PINNED_SETTLEMENT_ATTEMPT_EVENTS)[number];

/**
 * VALUE PIN — authority: @payswap/protocol
 * settlementAttemptStateMachine transitions FROM `IN_FLIGHT` (the state an
 * in-flight settlement attempt occupies when an onchain observation
 * arrives). Frozen, deterministic, total over the observation-derived
 * events: an observation may only suggest CONFIRM_SUCCEEDED /
 * CONFIRM_FAILED / OUTCOME_UNKNOWN from IN_FLIGHT.
 */
export const PINNED_SETTLEMENT_IN_FLIGHT_TRANSITIONS: Readonly<
  Record<"CONFIRM_SUCCEEDED" | "CONFIRM_FAILED" | "OUTCOME_UNKNOWN", PinnedSettlementAttemptState>
> = Object.freeze({
  CONFIRM_SUCCEEDED: "SUCCEEDED",
  CONFIRM_FAILED: "FAILED",
  OUTCOME_UNKNOWN: "OUTCOME_UNKNOWN",
});

/**
 * VALUE PIN — authority: @payswap/protocol
 * settlementAttemptStateMachine: the ONLY events that may leave
 * OUTCOME_UNKNOWN are the reconciliation resolution events (INV-04) —
 * there is no declared rule from OUTCOME_UNKNOWN to any ordinary event and
 * no coercion to FAILED exists anywhere. The onchain mapping never
 * suggests a blind retry event.
 */
export const PINNED_SETTLEMENT_OUTCOME_UNKNOWN_EXITS: readonly [
  "RECONCILE_RESOLVED_SUCCEEDED",
  "RECONCILE_RESOLVED_FAILED",
] = Object.freeze(["RECONCILE_RESOLVED_SUCCEEDED", "RECONCILE_RESOLVED_FAILED"]);

// ---------------------------------------------------------------------------
// The settlement reference pins (ids are REFERENCED, never constructed)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/protocol
 * src/settlement/instructions.ts `SettlementInstruction` (reference shape):
 * the canonical settlement instruction id an onchain rail-operation
 * mapping cites. The instruction (positive exact Money, net position,
 * authorization lineage — INV-5) is owned by the protocol lane; this
 * package references its id only.
 */
export interface SettlementInstructionRefPin {
  readonly settlementInstructionId: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/protocol
 * src/settlement/attempts.ts `SettlementAttempt` (reference shape): the
 * immutable settlement attempt record whose `rail` field carries the
 * deterministic onchain rail id (`onchain.${chainKey}` — INV-17: onchain
 * rails are rail-family members, not a separate settlement world).
 */
export interface SettlementAttemptRefPin {
  readonly settlementAttemptId: string;
  /** The rail this attempt executes on: `onchain.${chainKey}` for onchain. */
  readonly rail: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/protocol
 * src/settlement/finality.ts `FinalityRecord` (reference shape):
 * constructible ONLY through the settlement plane's FinalityAuthority
 * (INV-1: finality is protocol-owned). This package may hold an OPTIONAL
 * id reference to a minted finality record — never a finality state, never
 * a finality claim.
 */
export interface FinalityRecordRefPin {
  readonly finalityRecordId: string;
}
