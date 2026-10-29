/**
 * @payswap/route-compiler — the public barrel (P5-W1).
 *
 * Route optimization: best execution, route scoring and mixed-rail
 * DETERMINISTIC compilation. ONE neutral Money Movement Intent compiles
 * into candidate RoutePlans through a pure function; the provider-native
 * path is the BASELINE candidate (INV-C08); composed routes enter
 * comparison ONLY through the five-requirement comparability gate;
 * route/quote/authority/evidence lineage is preserved as exact
 * observation VERSIONS; liquidity estimates are ADVISORY ONLY.
 *
 * The barrel is the package's PUBLIC CONTRACT SURFACE (curated; the
 * internal helpers stay module-scoped and are importable from their
 * modules by the package's own tests — never by siblings). Zero runtime
 * dependencies; every cross-lane contract shape is a LOCAL STRUCTURAL
 * PIN (the v1 intelligence-layer leaf-in-flight law — the TL wires the
 * types at integration; never a value import).
 */

export const PACKAGE_NAME = "@payswap/route-compiler" as const;

// --- The deterministic backbone -------------------------------------------
export { canonicalJsonStringify, contentDigest, fnv1a64, deepFreeze, LIMITS } from "./canonical.ts";
export type { Fail } from "./canonical.ts";
export {
  isLeapYear,
  parseIsoUtc,
  isIsoUtcTimestamp,
  epochMillisFromIso,
  ISO_EPOCH_ORIGIN,
} from "./canonical-time.ts";
export type { IsoUtcComponents } from "./canonical-time.ts";
export {
  valueThroughRate,
  ZERO_RATIONAL,
  UNIT_RATIONAL,
} from "./exact-math.ts";
export type { ExactRational } from "./exact-math.ts";
export {
  validateAmountSpec,
  validatePositiveAmountSpec,
} from "./amount.ts";
export type { AmountSpec } from "./amount.ts";
export {
  routePlanId,
  routeLegId,
  routeHashFor,
  transferOutAuthorizationId,
  settlementInstructionBinding,
  capabilityObservationId,
  onchainLaneId,
  canonicalAssetRef,
  onchainRailId,
  protocolCapabilityId,
} from "./identifiers.ts";

// --- The error taxonomy -----------------------------------------------------
export {
  RouteCompilerError,
  ValidationError,
  InvalidMoneyMovementIntentError,
  InvalidRouteLegContractError,
  InvalidRoutePlanError,
  RouteCompilerInputError,
  VenueRegistryError,
  OnchainLaneDiscoveryError,
  ExecutionTransitionError,
  RouteInvalidatedError,
  LabTierSettlementRejectedError,
  RouteWalkError,
  isRouteCompilerError,
} from "./errors.ts";

// --- The pinned wire shapes (value pins, never value imports) --------------
export { PINNED_MONEY_MOVEMENT_INTENT_KEYS, PINNED_MAX_ROUTE_HOPS } from "./pins/economic.ts";
export type {
  AmountSpecPin,
  FundsLocationRefPin,
  IntentConstraintsPin,
  MoneyMovementIntentPin,
} from "./pins/economic.ts";
export { hasPinnedIntentKeySet } from "./pins/economic.ts";
export {
  PINNED_EXECUTION_MODES,
  PINNED_EXECUTION_MODE_VOCABULARY_VERSION,
} from "./pins/capability.ts";
export type {
  PinnedExecutionMode,
  PinnedAuthorizationState,
  PinnedPermissionState,
  PinnedInstanceEligibility,
  PinnedConnectedInstance,
  PinnedCapabilityObservation,
  PinnedCorridorRouteLineage,
  PinnedCorridorTermsReference,
  PinnedCorridorRouteEvaluation,
  PinnedCorridorView,
} from "./pins/capability.ts";
export {
  PINNED_SWAP_KINDS,
  PINNED_QUOTE_SEMANTICS,
  PINNED_SLIPPAGE_PROTECTION_MODELS,
  PINNED_CHAIN_FINALITY_MODELS,
  PINNED_ONCHAIN_FAILURE_CLASSES,
} from "./pins/onchain.ts";
export type {
  PinnedAssetIdentity,
  PinnedVenueSurfaceDescriptor,
  PinnedGateDecision,
  PinnedPreparedWrite,
  PinnedOnchainExecutionObservation,
  PinnedSwapKind,
  PinnedQuoteSemantics,
  PinnedChainFinalityModel,
  PinnedOnchainFailureClass,
} from "./pins/onchain.ts";
export { observationVersionFingerprint } from "./pins/execution-graph.ts";
export type {
  PinnedObservationVersionPin,
  PinnedVersionedObservationRecord,
  PinnedMaterialExecutionTerms,
} from "./pins/execution-graph.ts";

// --- The intent + the compiler inputs ---------------------------------------
export {
  validateMoneyMovementIntent,
  validateFundsLocationRef,
  validateIntentConstraints,
} from "./intent.ts";
export type { MoneyMovementIntent, FundsLocationRef, IntentConstraints } from "./intent.ts";
export { validateRoutingHints } from "./routing-hints.ts";
export type { RoutingHints } from "./routing-hints.ts";
export { convertAmount, sortedConversionRules } from "./conversion.ts";
export type { FiatConversionRule } from "./conversion.ts";
export { validateCompilerInput, laneSwapRequest } from "./compiler-input.ts";
export type { RouteCompilerInput, SecurityGateEvaluator } from "./compiler-input.ts";

// --- The leg contracts ------------------------------------------------------
export { ROUTE_LEG_KINDS, FIAT_LEG_KINDS, ONCHAIN_LEG_KINDS, MERCHANT_LEG_KINDS } from "./leg-kinds.ts";
export type { RouteLegKind, FiatLegKind, OnchainLegKind, MerchantLegKind } from "./leg-kinds.ts";
export { isRouteLegKind, legKindRailFamily } from "./leg-kinds.ts";
export {
  CUSTODY_PARTY_KINDS,
  validateCustodyParty,
  validateCustodyTransfer,
  assertCustodyContinuity,
} from "./custody.ts";
export type { CustodyParty, CustodyPartyKind, CustodyTransfer } from "./custody.ts";
export { RAIL_FAMILIES, railFamilyOf, custodyTransferCrossesRails, railCrossingCount, railCrossingMetric } from "./rail-family.ts";
export type { RailFamily, RailCrossingMetric } from "./rail-family.ts";
export { validateRouteLegBase, legIsExecutable } from "./leg-contracts.ts";
export type { RouteLegBase } from "./leg-contracts.ts";
export {
  AUTHORIZATION_EVIDENCE_KINDS,
  validateLegAuthorizationEvidence,
  validateAuthorizationLineage,
  validatePayoutGateReport,
  payoutGateAllows,
} from "./authorization.ts";
export type {
  LegAuthorizationEvidence,
  AuthorizationLineage,
  PayoutGateReport,
  OnchainGateDecisionEvidence,
  PayoutTransferOutGrantEvidence,
  CorridorEligibilityLineageEvidence,
  ProviderVerifiedSettlementEligibilityEvidence,
  IntentAuthorizationOnlyEvidence,
} from "./authorization.ts";
export {
  FUNDS_LOCATION_OBSERVATION_KINDS,
  isLocationObservationFresh,
  validateFundsLocationObservation,
} from "./grounding.ts";
export type { FundsLocationObservation, GroundedObservation, LegStateGrounding } from "./grounding.ts";
export {
  ROUTE_LEG_FAILURE_SEMANTICS,
  validateLegFinalityContract,
  onchainFinality,
  providerOwnedFinality,
} from "./finality.ts";
export type { LegFinalityContract, LegFinalityCandidate, LegFailureSemantics, ChainFinalityModel } from "./finality.ts";
export {
  PLANNED_AMOUNT_BASES,
  validatePlannedLegAmount,
} from "./planned-amount.ts";
export type { PlannedLegAmount, PlannedAmountBasis } from "./planned-amount.ts";
export {
  ASSUMPTION_BASES,
  validateAuditableAssumption,
  assumptionsValidAt,
} from "./assumptions.ts";
export type { AuditableAssumption, AssumptionBasis } from "./assumptions.ts";
export {
  onchainWalletParty,
  onchainProtocolParty,
  providerPoolParty,
  stablecoinIssuerParty,
  bankInstrumentParty,
} from "./leg-arms.ts";
export type { CorridorGroundedLeg, OnchainDexSwapLeg, OnchainWriteLeg } from "./leg-arms.ts";

// --- The corridor + the comparability gate ----------------------------------
export {
  corridorCandidates,
  nativeBaselineCorridorCandidate,
} from "./corridor.ts";
export type { CorridorCandidate } from "./corridor.ts";
export {
  COMPARABILITY_REQUIREMENTS,
  COMPARABILITY_GAP_CODES,
  evaluateComparabilityGate,
  verdictGapCodes,
} from "./comparability-gate.ts";
export type {
  ComparabilityRequirement,
  ComparabilityGapCode,
  ComparabilityGap,
  ComparabilityVerdict,
  ComparabilityGateInput,
} from "./comparability-gate.ts";

// --- The quote observation law + liquidity ----------------------------------
export {
  validateQuoteFreshness,
} from "./quote.ts";
export type {
  QuoteFreshness,
  QuoteProvenance,
  QuoteObserver,
  VenueQuote,
  VenueQuoteOutcome,
  TimeToSettlementDisclosure,
  SlippageDisclosure,
  OptimizationOrigin,
} from "./quote.ts";
export {
  QUOTE_FEE_KINDS,
  RISK_CLASSES,
  VENUE_HEALTH_STATUSES,
  riskClassRank,
  validateFailureRiskDisclosure,
  validateHealthObservation,
} from "./quote-fees.ts";
export type { QuoteFee, RiskClass, HealthObservation, VenueHealthStatus, FailureRiskDisclosure } from "./quote-fees.ts";
export {
  LIQUIDITY_ESTIMATE_MODELS,
  validateLiquidityEstimate,
  liquidityPermitsCustody,
  liquidityPermitsAuthorization,
} from "./liquidity.ts";
export type { LiquidityEstimate, LiquidityEstimateModel } from "./liquidity.ts";

// --- The scoring engine -----------------------------------------------------
export { TIE_BREAKER_KINDS, validateBestExecutionPolicy, policyRef, conversionFor } from "./policy.ts";
export type { BestExecutionPolicy, AssetConversionRule, TieBreakerKind } from "./policy.ts";
export { VALUED_COMPONENT_KINDS, evaluateNetOutcome, compareNetOutcomes } from "./scoring.ts";
export type { ValuedComponent, ValuedComponentKind, NetOutcomeEvaluation, ScoreableCandidate } from "./scoring.ts";
export { rankCandidates, rankScoredPlans } from "./scoring-order.ts";
export type { RankableCandidate, ScoredRoutePlan } from "./scoring-order.ts";
export {
  VenueRegistry, validateVenueDescriptor, validateSwapRequest, validateAssetIdentity } from "./venue-port.ts";
export type {
  VenueDescriptor,
  VenueNativeOptimizationDeclaration,
  VenueProtocolBinding,
  SwapRequest,
  VenueWritePlanningInput,
  ExecutionVenue,
} from "./venue-port.ts";
export { validateVenueQuote, validateVenueQuoteOutcome } from "./engine-support.ts";
export { BestExecutionEngine } from "./best-execution.ts";
export type { BestExecutionRequest, BestExecutionDecision, SelectedRoute } from "./best-execution.ts";
export { provenanceEvidenceRefs } from "./provenance.ts";
export type {
  CandidateStatus,
  CandidateEvaluationTrace,
  RouteProvenanceChain,
  SelectionProvenance,
} from "./provenance.ts";
export { checkSelectedRouteValidity, assertSelectedRouteValid } from "./route-validity.ts";
export type { RouteValidity, StaleRouteReason } from "./route-validity.ts";
export { ROUTE_EXECUTION_STATUSES, RouteExecutionRecord } from "./execution-record.ts";
export type { RouteExecutionStatus, RecordedExecutionObservation } from "./execution-record.ts";

// --- The mixed-rail machinery ----------------------------------------------
export {
  LAB_EXECUTION_TIER,
  isLabTieredValue,
  assertLabExecutionTier,
  labTierPermitsFinancialSettlement,
  rejectLabTierForFinancialSettlement,
} from "./simulation-tier.ts";
export type { LabExecutionTierBrand } from "./simulation-tier.ts";
export { groundLaneInputAsset } from "./lane-grounding.ts";
export type { LaneGroundingOutcome, LaneGroundingVerdict } from "./lane-grounding.ts";
export { discoverOnchainLane } from "./onchain-lane.ts";
export type { OnchainLaneProof, OnchainLaneDiscoveryResult, DiscoverOnchainLaneInput } from "./onchain-lane.ts";
export {
  executeOnchainLane,
  mapObservationToRailOutcome,
  settlementAttemptEventCandidate,
} from "./execution-walk.ts";
export type {
  OnchainLaneFault,
  OnchainLaneExecution,
  WalkExecutionObservation,
  OnchainRailOutcome,
  SettlementAttemptEventCandidate,
} from "./execution-walk.ts";

// --- The merchant leg family ------------------------------------------------
export {
  validateMerchantSettlementEligibility,
  merchantEligibilityIsFresh,
  merchantBalanceParty,
  merchantNativeSettlementUnavailable,
} from "./merchant-legs.ts";
export type {
  MerchantSettlementEligibilityEvidence,
  MerchantSettlementMode,
  MerchantNativeSettlementUnavailableMarker,
  MerchantBalanceSettlementLeg,
  ProviderSettlementObservation,
} from "./merchant-legs.ts";

// --- The payout/settlement constraints --------------------------------------
export {
  validatePayoutDestination,
  validateSettlementDestination,
} from "./payout-gate.ts";
export type {
  PayoutDestination,
  SettlementDestination,
  SettlementResult,
  PayoutConstraintVerdict,
} from "./payout-gate.ts";

// --- The compilation surface ------------------------------------------------
export {
  ROUTE_COMPILER_WIRE_VERSION,
  ROUTE_PLAN_SCHEMA_VERSION,
  ROUTE_SHAPE_IDS,
  ROUTE_PLAN_CANDIDATE_STATUSES,
  isRouteShapeId,
  shapeIsProviderNativeBaseline,
  shapeCompositionClass,
  shapeExecutionMode,
  shapeLegSequence,
} from "./shapes.ts";
export type { RouteShapeId, RouteCompositionClass, RoutePlanCandidateStatus } from "./shapes.ts";
export { buildRoutePlan, planCustodyChain } from "./route-plan.ts";
export type { RoutePlan, RouteLeg, RoutePlanIneligibilityReason, BuildRoutePlanInput } from "./route-plan.ts";
export { compileMoneyMovementRoute, compilationPermitsExecution } from "./compiler.ts";
export type { RouteCompilationResult, ExcludedRouteShape } from "./compiler.ts";
export { CROSS_PROVIDER_CORRIDOR_SHAPE_ID, observedCorridorMiddle } from "./compiler-corridor.ts";

// --- The walk + evidence ----------------------------------------------------
export {
  ROUTE_LEG_FAULT_KINDS,
  ROUTE_WALK_RESULT_STATUSES,
  walkRoutePlan,
} from "./route-walk.ts";
export type {
  RouteLegFault,
  RouteLegFaultKind,
  LegExecutionOutcomeStatus,
  RouteLegExecution,
  RouteWalkResultStatus,
  RouteReconciliationPlan,
  RouteWalkResult,
  WalkRoutePlanInput,
} from "./route-walk.ts";
export {
  buildRouteJourneyEvidence,
  routeJourneyEvidenceDigest,
  serializeRouteJourneyEvidence,
  buildRouteJourneyEvidenceFile,
  buildRoutePlanLineageRecord,
} from "./evidence.ts";
export type {
  RouteJourneyEvidenceRecord,
  RouteJourneyEvidenceFile,
  RoutePlanLineageRecord,
} from "./evidence.ts";
