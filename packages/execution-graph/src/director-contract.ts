/**
 * @payswap/execution-graph — DIRECTOR ADVISORY contracts (P3-W2, ENCODED
 * LAW 3; ADAPT of payswap.org@8a735bf packages/lab/src/director.ts, W2-004).
 *
 * WORK-ORDER LAW: "the Director is deterministic controls + replaceable
 * learned components — advisory only, never an authority."
 *
 * 3.0 RE-AUTHORIZATION (recorded): the old DirectorControl carried the Lab's
 * candidate registry + versioned promotion ledger (candidates.ts /
 * promotion.ts). That machinery is P6 territory (Lab) and is deliberately
 * NOT ported here. The Director in this package is the ADVISORY SEAM of the
 * economic execution graph:
 * - deterministic resolvers over the search index (capability grounding) and
 *   the replaceable search-plug-in seam (learned components);
 * - deterministic evaluation of a strategy program across scenarios x seeds
 *   (advisory evidence, INV-11);
 * - non-authoritative reasoning annotations (LLM reasoning is stored
 *   verbatim, structurally marked non-authoritative, mutates NOTHING);
 * - ZERO mutating methods over graph state: no attempt, plan, offer or
 *   projection is ever created, advanced or invalidated by the Director.
 *   The advisory-only law is machine-checked by the test suite.
 */

import type { StrategyProgram, StrategyAdvisory } from './strategy-contract.ts';
import type { SimulationScenarioPlan, SimulatedWorld } from './simulation-contract.ts';
import type { ExecutionSearchIndex, ExecutableBlock, ExecutionSearchQuery, SearchedCandidate } from './search-contract.ts';
import type { RunEvaluationResult, RobustnessEvidence, EvaluationSpec } from './evaluation-contract.ts';

/**
 * An LLM/learned-component reasoning annotation. `authoritative` is the
 * STRUCTURAL LITERAL `false` (canonical INV-09: agents and LLMs cannot
 * declare financial truth). Recording an annotation mutates NOTHING.
 */
export interface DirectorReasoningAnnotation {
  readonly annotationId: string;
  /** The strategy program (or candidate) the reasoning is about. */
  readonly programId: string;
  readonly reasoningText: string;
  readonly modelRef: string;
  readonly recordedAt: string;
  /** STRUCTURAL LITERAL: an annotation is never authority. */
  readonly authoritative: false;
}

/** Input to the Director's evaluation service. */
export interface TriggerEvaluationInput {
  readonly program: StrategyProgram;
  readonly scenarios: readonly SimulationScenarioPlan[];
  readonly worldsByScenario: Readonly<Record<string, SimulatedWorld>>;
  readonly seeds: readonly string[];
  /** Overrides the default spec (same shape). */
  readonly evaluationSpec?: EvaluationSpec;
}

/** The deterministic evaluation report for one strategy program. */
export interface CandidateEvaluationReport {
  readonly programId: string;
  readonly programVersion: string;
  readonly evaluations: readonly RunEvaluationResult[];
  readonly robustness: RobustnessEvidence;
}

/** The Director's advisory output: strategy advisory + evaluation evidence. */
export interface DirectorAdvisoryReport {
  readonly advisory: StrategyAdvisory;
  readonly evaluation: CandidateEvaluationReport;
  /** STRUCTURAL LITERAL: the whole report is advisory, never authority. */
  readonly authoritative: false;
}

/** Constructor input for `DirectorAdvisoryControl`. */
export interface DirectorAdvisoryControlInput {
  readonly searchIndex?: ExecutionSearchIndex;
  readonly world?: SimulatedWorld;
}

/** The resolvers exposed by the advisory control (deterministic, read-only). */
export interface DirectorResolvers {
  /** Capability resolver: executable blocks for a query (instance + observation only). */
  resolveCapability(query: ExecutionSearchQuery): readonly ExecutableBlock[];
  /** Strategy resolver: deterministic search over executable blocks via a plug-in. */
  resolveStrategy(input: {
    pluginId: string;
    query: ExecutionSearchQuery;
    world?: SimulatedWorld;
  }): readonly SearchedCandidate[];
}
