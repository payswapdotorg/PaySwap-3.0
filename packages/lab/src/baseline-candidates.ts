/**
 * The mandatory baseline candidate set (P6-W1; the P6 rebuild of the old
 * payswap.org@8a735bf packages/lab scenarios.ts baseline-candidates
 * section, W2-004 — LAB.md "Promotion").
 *
 * The mandatory baseline candidate set contains:
 * 1. deterministic/generalist;
 * 2. hand-designed;
 * 3. searched (output of the deterministic search plug-in);
 * 4. incumbent production candidate (provider-native,
 *    PASS_THROUGH_NATIVE, INV-15).
 *
 * All three execution modes appear in the baseline candidate set as
 * EXPLICIT side-by-side candidates (LAB.md). Everything here is pure data:
 * fixed preferences, no ambient clock, no randomness.
 */

import type { SimulationProgram } from "./simulation-plan.ts";
import type { PinnedExecutionMode } from "./pins/capability.ts";

// ---------------------------------------------------------------------------
// Baseline candidate programs (LAB.md "Promotion": mandatory baseline suite)
// ---------------------------------------------------------------------------

export type BaselineCandidateKind =
  | "DETERMINISTIC_GENERALIST"
  | "HAND_DESIGNED"
  | "SEARCHED"
  | "INCUMBENT_PRODUCTION";

export interface BaselineCandidate {
  readonly baselineKind: BaselineCandidateKind;
  readonly label: string;
  /**
   * One of the three explicit execution modes; all three modes appear in
   * the baseline candidate set as EXPLICIT side-by-side candidates
   * (LAB.md). NOTE THE FIELD NAME: `execution` — the accepted P6-W1 rename
   * of the old `executionMode` field (the vocabulary itself is unchanged
   * and remains credited to the capability lane).
   */
  readonly execution: PinnedExecutionMode;
  readonly program: SimulationProgram;
  /** INV-15: the incumbent provider-native baseline. */
  readonly isIncumbentBaseline: boolean;
}

/** Baseline 1 — deterministic/generalist (LAB.md). */
export const BASELINE_DETERMINISTIC_GENERALIST_PROGRAM: SimulationProgram = {
  programId: "baseline.deterministic-generalist",
  programVersion: "1.0.0",
  routePreference: ["rail-a", "rail-b", "rail-c", "rail-d"],
  useNetting: false,
  useNetworkCredit: false,
  delayToleranceSteps: 0,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

/** Baseline 2 — hand-designed (LAB.md). */
export const BASELINE_HAND_DESIGNED_PROGRAM: SimulationProgram = {
  programId: "baseline.hand-designed",
  programVersion: "1.0.0",
  routePreference: ["rail-b", "rail-a", "rail-c", "rail-d"],
  useNetting: true,
  useNetworkCredit: true,
  delayToleranceSteps: 2,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

/**
 * Baseline 3 — searched (LAB.md): the greedy multi-provider program shape
 * produced by the deterministic search plug-in over the baseline world.
 * Kept as data here so the baseline suite is usable without running a
 * search first; search-plugins.test.ts asserts the plug-in reproduces this
 * shape.
 */
export const BASELINE_SEARCHED_PROGRAM: SimulationProgram = {
  programId: "search.deterministic-baseline.optimized-multi-provider",
  programVersion: "1.0.0",
  routePreference: ["rail-d", "rail-b", "rail-a", "rail-c"],
  useNetting: true,
  useNetworkCredit: true,
  delayToleranceSteps: 2,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

/**
 * Baseline 4 — incumbent production candidate (LAB.md): the provider-native
 * optimization/recovery exposed by the incumbent connector, executed
 * PASS_THROUGH_NATIVE (INV-15). It is NOT assumed inferior: the evaluator
 * compares it against the composed candidates under identical hard
 * constraints and evidence requirements.
 */
export const BASELINE_INCUMBENT_PROGRAM: SimulationProgram = {
  programId: "baseline.incumbent-native",
  programVersion: "1.0.0",
  routePreference: ["rail-a"],
  useNetting: false,
  useNetworkCredit: false,
  delayToleranceSteps: 0,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

export const BASELINE_CANDIDATES: readonly BaselineCandidate[] = Object.freeze([
  {
    baselineKind: "DETERMINISTIC_GENERALIST",
    label: "deterministic generalist: preference-ordered, no batching",
    execution: "COMPOSED_PAYSWAP",
    program: BASELINE_DETERMINISTIC_GENERALIST_PROGRAM,
    isIncumbentBaseline: false,
  },
  {
    baselineKind: "HAND_DESIGNED",
    label: "hand-designed: latency-first preference, netting + explicit credit",
    execution: "COMPOSED_PAYSWAP",
    program: BASELINE_HAND_DESIGNED_PROGRAM,
    isIncumbentBaseline: false,
  },
  {
    baselineKind: "SEARCHED",
    label: "searched: greedy multi-provider with netting and explicit credit",
    execution: "OPTIMIZED_MULTI_PROVIDER",
    program: BASELINE_SEARCHED_PROGRAM,
    isIncumbentBaseline: false,
  },
  {
    baselineKind: "INCUMBENT_PRODUCTION",
    label: "incumbent production candidate: provider-native, pass-through",
    execution: "PASS_THROUGH_NATIVE",
    program: BASELINE_INCUMBENT_PROGRAM,
    isIncumbentBaseline: true,
  },
]);
