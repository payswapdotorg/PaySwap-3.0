/**
 * Director control interfaces (P6-W1; the P6 rebuild of the old
 * payswap.org@8a735bf packages/lab director.ts, W2-004 — LAB.md
 * "Director"; canonical INV-9 discipline).
 *
 * The Director is a SUBSYSTEM — a deterministic scheduler/policy engine
 * with replaceable learned components, not one privileged LLM. This
 * module provides its control surface:
 * - strategy resolver (deterministic search plug-ins);
 * - organization resolver (candidate organizations from the registry);
 * - capability resolver (executable blocks via instance + observation);
 * - mechanism resolver (participation mechanisms from the block index);
 * - candidate registry + evaluation/promotion service.
 *
 * LLMs can provide REASONING but cannot mutate authority state:
 * `recordReasoning` stores an annotation that is structurally marked
 * non-authoritative and never touches candidate stages, promotion orders
 * or any authority surface (canonical INV-9: agents and LLMs cannot
 * declare financial truth).
 *
 * Every promotion flows through the versioned ledger path
 * (`orderPromotion`); there is no direct stage mutation API. The
 * evaluation report is computed from simulation only — never from
 * production state (canonical INV-11).
 */

import type { DomainPack } from "./domain-packs.ts";
import { LabBuildingBlockIndex } from "./domain-packs.ts";
import type { ParticipationMechanismBlock } from "./domain-packs.ts";
import { evaluateRun, defaultEvaluationSpec } from "./evaluator.ts";
import type {
  EvaluationSpec,
  RobustnessEvidence,
  RunEvaluationResult,
} from "./evaluator.ts";
import { accumulateRobustnessEvidence } from "./evaluator.ts";
import { runSimulation } from "./simulation.ts";
import type { SimulatedWorld, SimulationProgram } from "./simulation.ts";
import type { LabScenario } from "./scenarios.ts";
import type {
  ExecutableBlock,
  LabSearchIndex,
  LabSearchQuery,
  SearchedCandidate,
} from "./search.ts";
import { selectExecutableBlocks } from "./search.ts";
import { runSearchPlugin } from "./search-plugins.ts";
import type { CandidateRegistry, LabCandidate, CandidateEvidenceRef } from "./candidates.ts";
import type { PromotionLedger, PromotionOrder, PromotionStage, PromotionEvidenceRef } from "./promotion.ts";
import { DirectorControlError } from "./errors.ts";

// ---------------------------------------------------------------------------
// Reasoning annotations (non-authoritative by construction)
// ---------------------------------------------------------------------------

export interface DirectorReasoningAnnotation {
  readonly annotationId: string;
  readonly candidateId: string;
  readonly reasoningText: string;
  readonly modelRef: string;
  readonly recordedAt: string;
  /**
   * STRUCTURALLY false: an LLM annotation is never authority (canonical
   * INV-9). Consumers can rely on this constant at the type level.
   */
  readonly authoritative: false;
}

// ---------------------------------------------------------------------------
// The Director control surface
// ---------------------------------------------------------------------------

export interface DirectorControlInput {
  readonly domainPack: DomainPack;
  readonly registry: CandidateRegistry;
  readonly promotionLedger: PromotionLedger;
  readonly searchIndex?: LabSearchIndex;
  readonly blockIndex?: LabBuildingBlockIndex;
}

export interface TriggerEvaluationInput {
  readonly candidateId: string;
  readonly scenarios: readonly LabScenario[];
  readonly seeds: readonly string[];
  /** Overrides the domain pack's default spec (same shape). */
  readonly evaluationSpec?: EvaluationSpec;
}

export interface CandidateEvaluationReport {
  readonly candidateId: string;
  readonly programId: string;
  readonly programVersion: string;
  readonly evaluations: readonly RunEvaluationResult[];
  readonly robustness: RobustnessEvidence;
}

/**
 * The deterministic Director control surface. All methods are pure
 * functions of (state, inputs); nothing consults a wall clock, and the
 * evaluation/promotion service operates exclusively through the candidate
 * registry and the versioned promotion ledger.
 */
export class DirectorControl {
  readonly domainPack: DomainPack;
  readonly registry: CandidateRegistry;
  readonly promotionLedger: PromotionLedger;
  private readonly searchIndex: LabSearchIndex | undefined;
  private readonly blockIndex: LabBuildingBlockIndex | undefined;
  private readonly reasoning: DirectorReasoningAnnotation[] = [];
  private reasoningSequence = 0;

  constructor(input: DirectorControlInput) {
    this.domainPack = input.domainPack;
    this.registry = input.registry;
    this.promotionLedger = input.promotionLedger;
    this.searchIndex = input.searchIndex;
    this.blockIndex = input.blockIndex;
  }

  // -- resolvers -----------------------------------------------------------

  /**
   * Strategy resolver: deterministic search over executable blocks via the
   * given plug-in (LAB.md "Search"). Candidates are grounded in
   * ConnectedCapabilityInstance + CapabilityObservation when a search index
   * is bound (INV-13).
   */
  resolveStrategy(input: {
    pluginId: string;
    world: SimulatedWorld;
    query: LabSearchQuery;
  }): readonly SearchedCandidate[] {
    const executableBlocks: readonly ExecutableBlock[] =
      this.searchIndex === undefined
        ? []
        : selectExecutableBlocks(this.searchIndex, input.query).executable;
    return runSearchPlugin(input.pluginId, {
      world: input.world,
      executableBlocks,
      query: input.query,
    });
  }

  /** Organization resolver: the candidate's composed organization DRAFT. */
  resolveOrganization(candidateId: string) {
    return this.registry.get(candidateId)?.organization;
  }

  /**
   * Capability resolver: executable blocks for a query — instance + current
   * observation only, never catalogue definitions alone (INV-13).
   */
  resolveCapability(query: LabSearchQuery): readonly ExecutableBlock[] {
    if (this.searchIndex === undefined) {
      throw new DirectorControlError(
        "no search index is bound to this Director control",
      );
    }
    return selectExecutableBlocks(this.searchIndex, query).executable;
  }

  /** Mechanism resolver: participation mechanisms in the block index. */
  resolveMechanism(filter?: {
    incentiveKind?: string;
  }): readonly ParticipationMechanismBlock[] {
    if (this.blockIndex === undefined) {
      throw new DirectorControlError(
        "no building-block index is bound to this Director control",
      );
    }
    const blocks = this.blockIndex.query({
      blockKind: "PARTICIPATION_MECHANISM",
    });
    const mechanisms = blocks.filter(
      (block): block is ParticipationMechanismBlock =>
        block.blockKind === "PARTICIPATION_MECHANISM",
    );
    if (filter?.incentiveKind === undefined) {
      return mechanisms;
    }
    return mechanisms.filter((mechanism) =>
      mechanism.incentiveKinds.includes(filter.incentiveKind ?? ""),
    );
  }

  // -- candidate selection / inspection ------------------------------------

  /** Deterministic candidate selection (registry order, filtered by mode). */
  selectCandidates(filter?: {
    execution?: LabCandidate["execution"];
    stage?: LabCandidate["stage"];
  }): readonly LabCandidate[] {
    return this.registry.list().filter((candidate) => {
      if (
        filter?.execution !== undefined &&
        candidate.execution !== filter.execution
      ) {
        return false;
      }
      if (filter?.stage !== undefined && candidate.stage !== filter.stage) {
        return false;
      }
      return true;
    });
  }

  inspectCandidate(candidateId: string): LabCandidate | undefined {
    return this.registry.get(candidateId);
  }

  // -- evaluation service ---------------------------------------------------

  /**
   * Triggers a deterministic evaluation of one candidate across the given
   * scenarios x seeds, accumulating robustness evidence (INV-L02). The
   * report is computed from simulation only — never from production state.
   */
  triggerEvaluation(input: TriggerEvaluationInput): CandidateEvaluationReport {
    const candidate = this.registry.get(input.candidateId);
    if (candidate === undefined) {
      throw new DirectorControlError(
        `unknown candidate '${input.candidateId}'`,
      );
    }
    const spec = input.evaluationSpec ?? this.defaultEvaluationSpec();
    const evaluations: RunEvaluationResult[] = [];
    for (const scenario of input.scenarios) {
      for (const seed of input.seeds) {
        const run = runSimulation({
          scenario: scenario.plan,
          world: scenario.world,
          program: candidate.program,
          seed,
        });
        evaluations.push(evaluateRun({ run, program: candidate.program, spec }));
      }
    }
    const robustness = accumulateRobustnessEvidence({
      programId: candidate.program.programId,
      programVersion: candidate.program.programVersion,
      evaluations,
    });
    return {
      candidateId: candidate.candidateId,
      programId: candidate.program.programId,
      programVersion: candidate.program.programVersion,
      evaluations: Object.freeze(evaluations),
      robustness,
    };
  }

  /**
   * Attaches the evaluation report as registry evidence (DRAFT ->
   * BENCHMARKED on the baseline-suite evaluation kind).
   */
  recordEvaluationEvidence(input: {
    candidateId: string;
    report: CandidateEvaluationReport;
    evidenceId: string;
    artifactRef: string;
  }): LabCandidate {
    const evidence: CandidateEvidenceRef = {
      evidenceId: input.evidenceId,
      kind: "BASELINE_SUITE_EVALUATION",
      artifactRef: input.artifactRef,
      contentDigest: input.report.robustness.digest,
    };
    return this.registry.attachEvidence({
      candidateId: input.candidateId,
      evidence: [evidence],
    });
  }

  private defaultEvaluationSpec(): EvaluationSpec {
    // Derive the evaluation spec from the domain pack declaration.
    return {
      hardConstraints: this.domainPack.hardConstraints.map((constraintId) => ({
        constraintId,
        description: `domain pack ${this.domainPack.packId} hard constraint ${constraintId}`,
      })),
      objectives: this.domainPack.objectives.map((objectiveId) => ({
        objectiveId,
        description: `domain pack ${this.domainPack.packId} objective ${objectiveId}`,
        weightBps: 100n,
      })),
      penalties: {
        hopPenaltyMinor: 1_000n,
        routeFailurePenaltyMinor: 50_000n,
        unknownOutcomePenaltyMinor: 25_000n,
        userActionPenaltyMinor: 5_000n,
      },
    };
  }

  // -- promotion service ----------------------------------------------------

  /**
   * Orders a promotion THROUGH THE VERSIONED LEDGER PATH ONLY. The Director
   * never mutates stages directly; the ledger enforces adjacency and the
   * INV-L02 evidence bundle, and the order is a proposal artifact.
   */
  orderPromotion(input: {
    candidateId: string;
    candidateVersion: number;
    targetStage: PromotionStage;
    evidence: readonly PromotionEvidenceRef[];
    orderedAt: string;
  }): PromotionOrder {
    return this.promotionLedger.orderPromotion(input);
  }

  promotionHistory(candidateId: string): readonly PromotionOrder[] {
    return this.promotionLedger.historyFor(candidateId);
  }

  currentPromotionStage(candidateId: string): PromotionStage {
    return this.promotionLedger.currentStage(candidateId);
  }

  // -- LLM reasoning (non-authoritative annotations) -------------------------

  /**
   * Records LLM reasoning about a candidate. The annotation is stored
   * verbatim, is structurally non-authoritative, and mutates NOTHING:
   * candidate stages, evidence, promotion orders and authority state are
   * all unaffected (canonical INV-9).
   */
  recordReasoning(input: {
    candidateId: string;
    reasoningText: string;
    modelRef: string;
    recordedAt: string;
  }): DirectorReasoningAnnotation {
    this.reasoningSequence += 1;
    const annotation: DirectorReasoningAnnotation = Object.freeze({
      annotationId: `director-reasoning:${this.reasoningSequence}`,
      candidateId: input.candidateId,
      reasoningText: input.reasoningText,
      modelRef: input.modelRef,
      recordedAt: input.recordedAt,
      authoritative: false,
    });
    this.reasoning.push(annotation);
    return annotation;
  }

  listReasoning(candidateId?: string): readonly DirectorReasoningAnnotation[] {
    const all = [...this.reasoning];
    if (candidateId === undefined) {
      return all;
    }
    return all.filter((annotation) => annotation.candidateId === candidateId);
  }
}

// ---------------------------------------------------------------------------
// Building-block index convenience (delegated, deterministic)
// ---------------------------------------------------------------------------

/** Placeholder for strategy programs handed to the Director by callers. */
export type DirectorStrategyProgram = SimulationProgram;

// ---------------------------------------------------------------------------
// Authority boundary (old FROZEN-ARCHITECTURE §227 -> canonical INV-9)
// ---------------------------------------------------------------------------
// The Director is a deterministic control surface with a replaceable
// learned-component seam (search plug-ins). LLM reasoning is recorded as
// a structurally non-authoritative annotation that mutates nothing.
// Promotion flows ONLY through the versioned ledger path. The candidate
// organizations it resolves are authority-free DRAFTS (no budgets, no
// delegation edges) — releasing, budgeting or delegating is exclusively
// protocol-authority territory outside the Lab.
