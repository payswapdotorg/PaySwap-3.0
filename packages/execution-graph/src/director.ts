/**
 * @payswap/execution-graph — the Director ADVISORY control (P3-W2, ENCODED
 * LAW 3; ADAPT of payswap.org@8a735bf packages/lab/src/director.ts, W2-004).
 *
 * The Director is deterministic controls + replaceable learned components —
 * ADVISORY ONLY, NEVER AN AUTHORITY (canonical INV-09/INV-11; old FROZEN
 * §227 discipline). Concretely:
 * - deterministic resolvers over the search index (INV-13 grounding) and
 *   the replaceable search-plug-in seam (learned components);
 * - deterministic evaluation of a strategy program across scenarios x
 *   seeds, accumulating robustness evidence;
 * - advisory issuance: strategy directives wrapped in the structurally
 *   non-authoritative envelope;
 * - non-authoritative reasoning annotations: LLM reasoning is stored
 *   verbatim, structurally marked `authoritative: false`, and mutates
 *   NOTHING;
 * - ZERO mutating methods over graph state: no attempt, plan, offer or
 *   projection is ever created, advanced or invalidated here. The class
 *   surface is machine-checked by the test suite (LAW 3).
 *
 * 3.0 adaptation (recorded): the old DirectorControl's candidate registry
 * and promotion ledger (old lab candidates.ts/promotion.ts) are P6 Lab
 * territory and are deliberately NOT ported.
 */

import { ValidationError } from './errors.ts';
import { deepFreeze } from './canonical.ts';
import { selectExecutableBlocks } from './search.ts';
import { runSearchPlugin } from './search-plugins.ts';
import { buildStrategyAdvisory } from './strategy.ts';
import { validateStrategyProgram } from './strategy.ts';
import { runSimulation } from './simulation.ts';
import { defaultEvaluationSpec, evaluateRun } from './evaluator.ts';
import { accumulateRobustnessEvidence } from './robustness.ts';
import type {
  CandidateEvaluationReport,
  DirectorAdvisoryControlInput,
  DirectorReasoningAnnotation,
  DirectorResolvers,
  TriggerEvaluationInput,
} from './director-contract.ts';
import type { ExecutionSearchIndex, ExecutionSearchQuery } from './search-contract.ts';
import type { SearchedCandidate } from './search-contract.ts';
import type { StrategyAdvisory, StrategyDemandShape, StrategyProgram } from './strategy-contract.ts';

/** The advisory-only method surface (machine-checkable; LAW 3). */
const ADVISORY_CONTROL_METHODS = [
  'resolveCapability',
  'resolveStrategy',
  'triggerEvaluation',
  'issueAdvisory',
  'recordReasoning',
  'listReasoning',
  'advisoryMethodSurface',
] as const;

/**
 * The deterministic Director ADVISORY control. All methods are pure
 * functions of (state, inputs); nothing consults a wall clock, and nothing
 * mutates any graph state.
 */
export class DirectorAdvisoryControl implements DirectorResolvers {
  readonly #searchIndex: ExecutionSearchIndex | undefined;
  readonly #defaultWorld: import('./simulation-contract.ts').SimulatedWorld | undefined;
  readonly #reasoning: DirectorReasoningAnnotation[] = [];
  #reasoningSequence = 0;

  constructor(input: DirectorAdvisoryControlInput = {}) {
    this.#searchIndex = input.searchIndex;
    this.#defaultWorld = input.world;
  }

  /** Capability resolver: executable blocks grounded in instances + observations (INV-13). */
  resolveCapability(query: ExecutionSearchQuery): readonly import('./search-contract.ts').ExecutableBlock[] {
    if (this.#searchIndex === undefined) {
      throw new ValidationError('no search index is bound to this Director control');
    }
    return selectExecutableBlocks(this.#searchIndex, query).executable;
  }

  /** Strategy resolver: deterministic search over executable blocks via a plug-in. */
  resolveStrategy(input: {
    pluginId: string;
    query: ExecutionSearchQuery;
    world?: import('./simulation-contract.ts').SimulatedWorld;
  }): readonly SearchedCandidate[] {
    if (this.#searchIndex === undefined) {
      throw new ValidationError('no search index is bound to this Director control');
    }
    const world = input.world ?? this.#defaultWorld;
    if (world === undefined) {
      throw new ValidationError(
        'strategy resolution requires a simulated world (bound or supplied)',
      );
    }
    const blocks = selectExecutableBlocks(this.#searchIndex, input.query).executable;
    return runSearchPlugin(input.pluginId, { world, executableBlocks: blocks, query: input.query });
  }

  /**
   * Deterministic evaluation of one strategy program across scenarios x
   * seeds, accumulating robustness evidence. The report is computed from
   * simulation only — never from production state (INV-11).
   */
  triggerEvaluation(input: TriggerEvaluationInput): CandidateEvaluationReport {
    validateStrategyProgram(input.program);
    if (input.scenarios.length === 0 || input.seeds.length === 0) {
      throw new ValidationError(
        'an evaluation requires at least one scenario and one seed (robustness is not a single lucky run)',
      );
    }
    const spec = input.evaluationSpec ?? defaultEvaluationSpec();
    const evaluations = [];
    for (const scenario of input.scenarios) {
      const world = input.worldsByScenario[scenario.scenarioId] ?? this.#defaultWorld;
      if (world === undefined) {
        throw new ValidationError(
          `no simulated world is bound for scenario '${scenario.scenarioId}'`,
        );
      }
      for (const seed of input.seeds) {
        const run = runSimulation({ scenario, world, program: input.program, seed });
        evaluations.push(evaluateRun({ run, program: input.program, spec }));
      }
    }
    const robustness = accumulateRobustnessEvidence({
      programId: input.program.programId,
      programVersion: input.program.programVersion,
      evaluations,
    });
    return deepFreeze({
      programId: input.program.programId,
      programVersion: input.program.programVersion,
      evaluations: Object.freeze(evaluations),
      robustness,
    });
  }

  /**
   * Issue the Director's ADVISORY for a program over one demand shape:
   * the strategy directives (WHAT to do) plus the deterministic evaluation
   * evidence — all wrapped in the structurally non-authoritative envelope.
   * Nothing in the graph is created, advanced or invalidated by this call.
   * The evaluation input is REQUIRED: an advisory without robustness
   * evidence is not an advisory this Director will issue.
   */
  issueAdvisory(input: {
    readonly program: StrategyProgram;
    readonly demandShape: StrategyDemandShape;
    readonly issuedAt: import('@payswap/protocol').TimestampMs;
    readonly evaluation: TriggerEvaluationInput;
  }): import('./director-contract.ts').DirectorAdvisoryReport {
    const advisory: StrategyAdvisory = buildStrategyAdvisory(
      input.program,
      input.demandShape,
      input.issuedAt,
    );
    const evaluation = this.triggerEvaluation(input.evaluation);
    return deepFreeze({
      advisory,
      evaluation,
      authoritative: false,
    });
  }

  /**
   * Record LLM/learned-component reasoning. The annotation is stored
   * verbatim, is structurally non-authoritative, and mutates NOTHING:
   * graph state, evaluations and advisories are all unaffected.
   */
  recordReasoning(input: {
    readonly programId: string;
    readonly reasoningText: string;
    readonly modelRef: string;
    readonly recordedAt: string;
  }): DirectorReasoningAnnotation {
    if (typeof input.programId !== 'string' || input.programId.length === 0) {
      throw new ValidationError('a reasoning annotation must reference a program id');
    }
    if (typeof input.reasoningText !== 'string' || input.reasoningText.length === 0) {
      throw new ValidationError('a reasoning annotation must carry reasoning text');
    }
    if (typeof input.modelRef !== 'string' || input.modelRef.length === 0) {
      throw new ValidationError('a reasoning annotation must reference its model');
    }
    if (typeof input.recordedAt !== 'string' || input.recordedAt.length === 0) {
      throw new ValidationError('a reasoning annotation must carry a recordedAt stamp');
    }
    this.#reasoningSequence += 1;
    const annotation: DirectorReasoningAnnotation = Object.freeze({
      annotationId: `director-reasoning:${this.#reasoningSequence}`,
      programId: input.programId,
      reasoningText: input.reasoningText,
      modelRef: input.modelRef,
      recordedAt: input.recordedAt,
      authoritative: false,
    });
    this.#reasoning.push(annotation);
    return annotation;
  }

  /** The recorded reasoning annotations, optionally filtered by program. */
  listReasoning(programId?: string): readonly DirectorReasoningAnnotation[] {
    const all = [...this.#reasoning];
    if (programId === undefined) {
      return all;
    }
    return all.filter((annotation) => annotation.programId === programId);
  }

  /**
   * The advisory-only method surface (LAW 3 machine-check target): the
   * complete list of public methods this control exposes. A graph-mutating
   * method name can never appear here.
   */
  advisoryMethodSurface(): readonly string[] {
    return [...ADVISORY_CONTROL_METHODS];
  }
}
