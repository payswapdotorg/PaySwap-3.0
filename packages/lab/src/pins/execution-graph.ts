/**
 * @payswap/lab — the PINNED WIRE SHAPES of the strategy/economic
 * execution-graph seam (P6-W1, lane R4-W1; commit 1/4 — the type-level
 * pins).
 *
 * LAYER LAW: zero sibling imports. Authority: @payswap/execution-graph
 * (P3-W2, accepted) — the economic execution graph lane that ADAPTED the
 * old lab's simulation/search/strategy/evaluator families as its
 * ADVISORY SEAM and recorded the re-authorization: the candidate registry
 * + versioned promotion ledger are P6 (Lab) territory and are deliberately
 * NOT owned there. This package owns that machinery.
 *
 * SUBSET-TYPING LAW: the Lab's SimulationProgram is field-compatible with
 * the authority's StrategyProgram (a real StrategyProgram value is
 * assignable to the Lab program shape and vice versa — asserted by
 * test/type-contracts.test.ts). The Lab simulation namespace is its own
 * ('PAYSWAP_LAB_SIMULATION'); the execution-graph lane's simulation
 * namespace is separate by design (advisory seam vs. intelligence lab).
 */

import type { PinnedExecutionMode } from "./capability.ts";

// ---------------------------------------------------------------------------
// The strategy program seam (STRUCTURAL PIN — authority:
// @payswap/execution-graph src/strategy-contract.ts `StrategyProgram`)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/execution-graph
 * src/strategy-contract.ts `StrategyProgram` (field-compatible subset
 * typing; the authority's shape is the same field set — programId,
 * programVersion, routePreference, useNetting, useNetworkCredit,
 * delayToleranceSteps, fraudScreening, privacyBounded, authorizationMode).
 *
 * A deterministic routing/settlement policy under evaluation — pure data,
 * no authority, no credentials, no protocol-command shape. A program may
 * DECLARE a bypass (`authorizationMode: 'DECLARED_BYPASS'`) so the
 * evaluator can fail it — declaring is the only way to reach it; nothing
 * here fabricates authorization.
 */
export interface PinnedStrategyProgram {
  readonly programId: string;
  readonly programVersion: string;
  /** Ordered rail preferences; the first usable rail wins (simulator input). */
  readonly routePreference: readonly string[];
  /** Batch co-directional demands inside the delay window (netting). */
  readonly useNetting: boolean;
  /** Cover liquidity gaps with explicit network credit (INV-02 discipline). */
  readonly useNetworkCredit: boolean;
  /** How many steps a demand may be deferred for batching. */
  readonly delayToleranceSteps: number;
  /** Screen fraudulent demands (hard compliance constraint). */
  readonly fraudScreening: boolean;
  /** Context receives only the minimum data required (privacy discipline). */
  readonly privacyBounded: boolean;
  /**
   * A program may declare a bypass — the simulator will then settle without
   * authorization and the evaluator's AUTHORIZATION hard constraint fails.
   */
  readonly authorizationMode: "PROTOCOL_AUTHORIZED" | "DECLARED_BYPASS";
}

/**
 * The strategy-directive WHAT-vocabulary pin (authority:
 * @payswap/execution-graph `STRATEGY_DIRECTIVE_KINDS`): strategies answer
 * WHAT (settle-now, batch, net-later, hold-for-review) — never HOW (route
 * compilation is the route-compiler lane) and never authority (INV-09).
 */
export const PINNED_STRATEGY_DIRECTIVE_KINDS = Object.freeze([
  "SETTLE_NOW",
  "BATCH",
  "NET_LATER",
  "HOLD_FOR_REVIEW",
] as const);

/**
 * STRUCTURAL PIN — authority: @payswap/execution-graph
 * `StrategyDirectiveKind`.
 */
export type PinnedStrategyDirectiveKind =
  (typeof PINNED_STRATEGY_DIRECTIVE_KINDS)[number];

// ---------------------------------------------------------------------------
// The execution-mode field rename pin (the accepted P6-W1 rename)
// ---------------------------------------------------------------------------

/**
 * The accepted P6-W1 RENAME, pinned as one type: where the old lab search
 * carried `executionMode`, this package's search surfaces carry the field
 * name `execution` of the SAME capability-lane vocabulary type. The rename
 * is a FIELD-NAME choice only — the vocabulary members, order and
 * no-priority law are byte-identical to the capability lane's
 * (PINNED_EXECUTION_MODES in ./capability.ts).
 */
export interface PinnedExecutionField {
  /** The execution mode (renamed field; vocabulary unchanged). */
  readonly execution: PinnedExecutionMode;
}

/** Total predicate over the pinned strategy-directive vocabulary. */
export function isPinnedStrategyDirectiveKind(
  value: unknown,
): value is PinnedStrategyDirectiveKind {
  return (
    typeof value === "string" &&
    (PINNED_STRATEGY_DIRECTIVE_KINDS as readonly unknown[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// The advisory-envelope discipline pin
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/execution-graph
 * src/strategy-contract.ts `StrategyAdvisory` (subset typing: every Lab
 * advisory artifact carries the STRUCTURAL LITERAL `authoritative: false`
 * — canonical INV-09/INV-11: intelligence output never commits financial
 * truth).
 */
export interface PinnedAdvisoryEnvelope {
  /** STRUCTURAL LITERAL: Lab artifacts are never authority (INV-09/INV-11). */
  readonly authoritative: false;
}
