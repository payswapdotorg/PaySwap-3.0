/**
 * @payswap/lab — the Reality Engineering Lab (Work Order P6-W1, lane
 * R4-W1; the P6 rebuild of the old payswap.org@8a735bf packages/lab,
 * W2-004).
 *
 * Replay, counterfactuals, fault injection, Organization/Strategy search,
 * robustness, shadow and canary promotion. Simulated routes/events are
 * advisory/test evidence only; no production financial authority
 * (canonical INV-11: simulation is never production financial authority).
 *
 * Package-level invariants (mirrors of the old W2-004 laws, re-cited to
 * the canonical 3.0 invariants):
 * - INV-L01 (canonical INV-11): the simulation namespace is isolated and
 *   branded; no export path converts a simulation result into any
 *   production-evidence type; the engine family imports nothing external.
 * - INV-L02: promotion to SHADOW or beyond requires the complete evidence
 *   bundle (replay + counterfactual + robustness, plus the per-stage
 *   shadow/canary reports) — PromotionEvidenceError otherwise, no
 *   override path.
 * - INV-L03: promotion is versioned and reversible (append-only ledger;
 *   rollback appends, history is never rewritten).
 * - INV-13: executable search is instance + observation grounded — never
 *   catalogue definitions alone; two-axis UNKNOWN is preserved verbatim.
 * - INV-15: provider-native incumbents compete without a composition
 *   prior (no mode-based ranking advantage).
 * - INV-9: Lab composition is a proposal; it grants no authority.
 *
 * LAYER LAW: zero sibling imports — every cross-lane contract shape is a
 * LOCAL STRUCTURAL PIN (see ./pins/index.ts for the authority map; the TL
 * wires the imports at integration).
 *
 * THE ACCEPTED RENAMES (recorded in the P6-W1 work order):
 * - executionMode -> execution: the Lab search surfaces carry the field
 *   name `execution` (the vocabulary itself is unchanged and remains
 *   credited to the capability lane).
 * - ServiceAccess -> DECLARED_CAPABILITY: the building-block kind the old
 *   repo called SERVICE_ACCESS is re-declared as DECLARED_CAPABILITY.
 */

export const PACKAGE_NAME = "@payswap/lab" as const;

// The pinned wire shapes (commit 1/4): every external seam.
export * from "./pins/index.ts";

// The deterministic core (digest + PRNG).
export { canonicalize, fnv1a64, deepFreeze, DeterministicRandom } from "./canonical.ts";

// The simulation family (INV-L01: namespaced, isolated, deterministic).
export {
  runSimulation,
  simulationDigest,
  emptyMetrics,
  SIMULATION_NAMESPACE,
  isSimulationResult,
  isDemandOutcome,
  isSimulatedWorld,
  DEMAND_DIRECTIONS,
  DEMAND_OUTCOMES,
  ADVERSARIAL_DEMAND_KINDS,
  isAdversarialDemandKind,
  isDemandDirection,
  SCENARIO_INCIDENT_TYPES,
  isScenarioIncidentType,
} from "./simulation.ts";
export type {
  SimulatedRail,
  SimulatedLiquidityPool,
  SimulatedWorld,
  DemandDirection,
  AdversarialDemandKind,
  DemandPlan,
  ScenarioIncident,
  ScenarioIncidentType,
  SimulationScenarioPlan,
  SimulationProgram,
  DemandOutcome,
  DemandOutcomeRecord,
  SimulationMetrics,
  SimulationRunInput,
  SimulationRunResult,
  SimulationNamespaceBrand,
  MutableSimulationMetrics,
} from "./simulation.ts";

// Scenario composition + the mandatory baseline suite.
export {
  BASELINE_WORLD,
  BASELINE_SCENARIOS,
  BASELINE_SEED,
  BASELINE_SUITE_ID,
  BASELINE_SUITE_VERSION,
  PAYMENT_ROUTING_DOMAIN_PACK,
  getBaselineSuite,
} from "./scenarios.ts";
export type { LabScenario, BaselineSuite } from "./scenarios.ts";

// The mandatory baseline candidate set.
export {
  BASELINE_DETERMINISTIC_GENERALIST_PROGRAM,
  BASELINE_HAND_DESIGNED_PROGRAM,
  BASELINE_SEARCHED_PROGRAM,
  BASELINE_INCUMBENT_PROGRAM,
  BASELINE_CANDIDATES,
} from "./baseline-candidates.ts";
export type { BaselineCandidateKind, BaselineCandidate } from "./baseline-candidates.ts";

// Domain Packs + the searchable building-block index.
export {
  LAB_SCENARIO_TYPE_IDS,
  isLabScenarioTypeId,
  LAB_BUILDING_BLOCK_KINDS,
  isLabBuildingBlockKind,
  validateDomainPack,
  DomainPackRegistry,
  LabBuildingBlockIndex,
} from "./domain-packs.ts";
export type {
  LabScenarioTypeId,
  ActionDimension,
  EvaluationSuiteRef,
  ProvenanceRequirement,
  DomainPack,
  LabBuildingBlockKind,
  CertifiedSmartContractBlock,
  DeclaredCapabilityBlock,
  ConnectorCapabilityBlock,
  ParticipationMechanismBlock,
  LabBuildingBlock,
  BlockRegistrationRejection,
  BlockRegistrationResult,
} from "./domain-packs.ts";

// The evaluator (hard constraints BEFORE optimization) + robustness.
export {
  evaluateRun,
  accumulateRobustnessEvidence,
  HARD_CONSTRAINT_IDS,
  isHardConstraintId,
  OBJECTIVE_IDS,
  isObjectiveId,
  defaultEvaluationSpec,
  validateEvaluationSpec,
} from "./evaluator.ts";
export type {
  RunEvaluationResult,
  EvaluateRunInput,
  HardConstraintResult,
  HardConstraintsPhase,
  ObjectiveContribution,
  OptimizationPhase,
  RobustnessRunRecord,
  RobustnessEvidence,
  HardConstraintSpec,
  ObjectiveSpec,
  ObjectivePenalties,
  EvaluationSpec,
} from "./evaluator.ts";

// Replay + counterfactual over immutable recorded facts.
export {
  REPLAY_NAMESPACE,
  recordProductionFacts,
  recordedFactsDigest,
  runReplay,
  isReplayResult,
  countOutcomes,
} from "./replay.ts";
export type {
  RecordedDemandFact,
  RecordedIncidentFact,
  RecordedProductionFacts,
  ReplayInput,
  ReplayResult,
  ReplayNamespaceBrand,
} from "./replay.ts";
export { runCounterfactual } from "./counterfactual.ts";
export type {
  CounterfactualInput,
  ReplayDelta,
  CounterfactualResult,
} from "./counterfactual.ts";

// Executable search + replaceable plug-ins.
export {
  buildLabSearchIndex,
  latestObservationFor,
  selectExecutableBlocks,
} from "./search.ts";
export type {
  LabSearchQuery,
  SearchRejectionReason,
  SearchSelection,
  ExecutableBlock,
  LabSearchIndex,
  LabSearchInput,
  SearchedCandidate,
} from "./search.ts";
export {
  deterministicBaselineSearchPlugin,
  handDesignedBaselineSearchPlugin,
  registerSearchPlugin,
  listSearchPlugins,
  getSearchPlugin,
  runSearchPlugin,
} from "./search-plugins.ts";
export type { LabSearchPlugin } from "./search-plugins.ts";

// The candidate registry (proposal-only; authority-free organizations).
export {
  CANDIDATE_STAGES,
  isCandidateStage,
  LAB_PROPOSAL_ONLY_CONSTRAINT,
  composeCandidateOrganization,
  CandidateRegistry,
} from "./candidates.ts";
export type {
  CandidateStage,
  CandidateBuildingBlockRef,
  CandidateEvidenceKind,
  CandidateEvidenceRef,
  LabCandidate,
  PublishedCandidateVersion,
  ComposeCandidateOrganizationInput,
} from "./candidates.ts";

// The versioned, reversible shadow/canary promotion ledger.
export {
  PROMOTION_STAGES,
  isPromotionStage,
  PROMOTION_EVIDENCE_KINDS,
  isPromotionEvidenceKind,
  requiredEvidenceForTarget,
  PromotionLedger,
} from "./promotion.ts";
export type {
  PromotionStage,
  PromotionEvidenceKind,
  PromotionEvidenceRef,
  PromotionOrderKind,
  PromotionOrder,
} from "./promotion.ts";
export { comparePromotionCandidates } from "./promotion-comparison.ts";
export type {
  PromotionCandidateEvaluation,
  RankedPromotionCandidate,
} from "./promotion-comparison.ts";

// The Director control surface (deterministic controls + replaceable
// learned components; LLM reasoning is stored, never authoritative).
export { DirectorControl } from "./director.ts";
export type {
  DirectorReasoningAnnotation,
  DirectorControlInput,
  TriggerEvaluationInput,
  CandidateEvaluationReport,
  DirectorStrategyProgram,
} from "./director.ts";

// The Lab error taxonomy (fail-closed, family errors).
export {
  LabError,
  DomainPackValidationError,
  LabBuildingBlockIndexError,
  CandidateRegistryError,
  PromotionError,
  PromotionSkipError,
  PromotionEvidenceError,
  DirectorControlError,
  RecordedFactsError,
  LabSearchError,
} from "./errors.ts";


// ---------------------------------------------------------------------------
// The module map (where every family lives)
// ---------------------------------------------------------------------------
// - ./canonical.ts            deterministic core: canonicalize, fnv1a64,
//                              deepFreeze, DeterministicRandom (splitmix64)
// - ./simulation-world.ts      rails / pools / the simulated world model
// - ./simulation-plan.ts       demands, incidents, scenario plans, programs
// - ./simulation-metrics.ts    outcome taxonomy, metrics, namespace brand
// - ./simulation-engine.ts     the step scheduler (incidents -> demands)
// - ./simulation-settle.ts     rail choice, settlement, netting coalescing
// - ./simulation.ts            the public engine surface + digest + re-exports
// - ./scenarios.ts             the mandatory baseline suite + canonical pack
// - ./baseline-candidates.ts   the four mandatory baseline candidates
// - ./domain-packs.ts          DomainPacks + the building-block index
// - ./evaluation-spec.ts       hard-constraint/objective vocabulary + specs
// - ./evaluator.ts             evaluateRun (phases tuple) + robustness
// - ./replay.ts                recorded facts, replay, outcome counters
// - ./counterfactual.ts        counterfactual deltas over frozen facts
// - ./search.ts                executable grounding + selection
// - ./search-plugins.ts        deterministic + hand-designed baselines, registry
// - ./candidates.ts            candidate registry + authority-free composition
// - ./promotion.ts             the versioned reversible promotion ledger
// - ./promotion-comparison.ts  side-by-side ranking (no mode prior)
// - ./director.ts              the Director control surface
// - ./errors.ts                the Lab error taxonomy (fail-closed)
// - ./pins/*                   every external seam as local structural pins
