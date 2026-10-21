/**
 * PaySwap Desktop (P7-W2) — the structural pin barrel.
 *
 * SUBSTRATE LAW: packages/desktop never imports @payswap/* — every shared
 * contract shape the desktop product composes is pinned structurally in
 * this tree and recorded in the pin registry. See pin-registry.ts for the
 * pin law and the mirrored sources.
 */

export {
  PAYSWAP_DESKTOP_PIN_SET_VERSION,
  PAYSWAP_DESKTOP_PIN_SOURCE_COMMIT,
  PAYSWAP_CONSOLE_WORKSPACE_PIN_SOURCE_COMMIT,
  PAYSWAP_DESKTOP_PINS,
  DESKTOP_PIN_PROVENANCE,
  pinById,
  pinsForPackage,
} from "./pin-registry.js";
export type { PaySwapContractPin, DesktopPinProvenance } from "./pin-registry.js";

export {
  CONSOLE_WORKSPACE_PIN_STAMP,
  PINNED_MISSION_INTENT_DIRECTIONS,
  PINNED_MISSION_INTAKE_BOUNDS,
  PINNED_MISSION_DRAFT_STATUSES,
  PINNED_MISSION_LIFECYCLE_RUNGS,
  PINNED_MISSION_EVENT_KINDS,
  PINNED_LADDER_INTENT_PREREQUISITE,
  PINNED_LADDER_ELIGIBILITY_PREREQUISITE,
  PINNED_LADDER_PLANNING_PREREQUISITE,
  PINNED_LADDER_APPROVAL_PREREQUISITE,
  PINNED_LADDER_EXECUTION_PREREQUISITE,
  PINNED_LADDER_OBSERVATION_PREREQUISITE,
  PINNED_LADDER_EVIDENCE_PREREQUISITE,
  PINNED_LADDER_PREREQUISITES,
  PINNED_WORKSPACE_STORE_DURABILITY,
  PINNED_WORKSPACE_STORE_PORT_METHODS,
  isPinnedMissionIntentDirection,
  isPinnedMissionDraftStatus,
  isPinnedMissionEventKind,
  isPinnedMissionLifecycleRung,
} from "./mission-intake-pins.js";
export type {
  ConsoleWorkspacePinStamp,
  PinnedMissionIntentDirection,
  PinnedMissionIntakeInput,
  PinnedMissionDraftStatus,
  PinnedMissionLifecycleRung,
  PinnedMissionRungState,
  PinnedMissionEventKind,
  PinnedMissionEvent,
  PinnedMissionStructuralValidation,
  PinnedMissionRecord,
  PinnedMissionSummary,
  PinnedMissionDetail,
  PinnedWorkspaceStoreDurability,
  PinnedWorkspaceStorePortMethod,
} from "./mission-intake-pins.js";

export {
  PINNED_SURFACE_API_VERSION,
  PINNED_CURRENCY_PATTERN,
  PINNED_MINOR_UNITS_PATTERN,
  PINNED_OUTCOME_ACTION_IDS,
  SURFACE_PIN_STAMP,
  pinnedSurfaceProvenance,
  isPinnedOutcomeActionId,
  isPinnedAmountSpec,
  validatePinnedAmountSpec,
} from "./surface-pins.js";
export type {
  PinnedSurfaceStability,
  PinnedSurfaceProvenance,
  PinnedAmountSpec,
  PinnedDisplayLocaleInput,
  PinnedMoneyDisplayInput,
  PinnedMinorUnitDigitsSource,
  PinnedOutcomeActionId,
  PinnedOutcomeDispatchAuthority,
  PinnedOutcomeCapabilityState,
  PinnedOutcomeDeploymentContext,
  PinnedOutcomeActionRecord,
  SurfacePinStamp,
} from "./surface-pins.js";

export {
  PINNED_UNIVERSAL_AREA_IDS,
  PINNED_UNIVERSAL_AREAS,
  PINNED_OUTCOME_ACTIONS,
  pinnedUniversalAreaById,
  pinnedOutcomeActionById,
  isPinnedUniversalAreaId,
} from "./surface-areas-pins.js";
export type {
  PinnedUniversalAreaId,
  PinnedAreaEmptyStateContract,
  PinnedUniversalArea,
} from "./surface-areas-pins.js";

export {
  PINNED_DELIVERY_ESTIMATE_KINDS,
  isPinnedDeliveryEstimateKind,
  isPinnedQuoteFeeBasis,
} from "./quote-terms-pins.js";
export type {
  PinnedQuoteFeeBasis,
  PinnedQuoteFeeLine,
  PinnedDeliveryEstimateKind,
  PinnedQuoteDeliveryEstimate,
  PinnedQuoteRate,
  PinnedQuoteExpiry,
  PinnedQuoteFundingAssumption,
  PinnedQuoteRecipientAssumption,
  PinnedQuoteConditions,
  PinnedQuoteTermsSource,
  PinnedQuoteFoldInput,
  PinnedQuoteFreshness,
  PinnedQuoteTermsView,
} from "./quote-terms-pins.js";

export {
  PINNED_SURFACE_PROGRESS_STAGES,
  PINNED_STAGE_STATUSES,
  PINNED_AUTHORIZATION_CHANGE_KINDS,
  isPinnedProgressStage,
  isPinnedStageStatus,
  isPinnedGateVerdict,
} from "./progress-security-pins.js";
export type {
  PinnedSurfaceProgressStage,
  PinnedStageStatus,
  PinnedStageObservation,
  PinnedProgressFoldInput,
  PinnedStageTone,
  PinnedStageView,
  PinnedProgressFacts,
  PinnedProgressTimelineView,
  PinnedGatePresentationTone,
  PinnedGateBlockReason,
  PinnedGateAllowCheck,
  PinnedGateUnknownDimension,
  PinnedSecurityGateDecisionSource,
  PinnedSecurityDecisionView,
  PinnedAuthorizationChangeKind,
  PinnedAuthorizationChangeClass,
} from "./progress-security-pins.js";

export {
  PINNED_SETTLEMENT_ATTEMPT_STATES,
  PINNED_SETTLEMENT_ATTEMPT_EVENTS,
  PINNED_TERMINAL_ATTEMPT_STATES,
  PINNED_EVIDENCE_NODE_KINDS,
  validatePinnedAuthorizationRef,
  isPinnedSettlementAttemptState,
  isPinnedEvidenceNodeKind,
} from "./lifecycle-pins.js";
export type {
  PinnedSettlementAttemptState,
  PinnedSettlementAttemptEvent,
  PinnedSettlementAttemptRecord,
  PinnedEvidenceNodeKind,
  PinnedEvidenceNodeRecord,
  PinnedAuthorizationRef,
} from "./lifecycle-pins.js";

export {
  PINNED_EXTERNAL_EFFECT_OUTCOMES,
  PINNED_AMBIGUITY_REASONS,
  PINNED_EXECUTION_MODES,
  isPinnedExternalEffectOutcome,
  isPinnedAmbiguityReason,
  validatePinnedExecutionResultEnvelope,
} from "./bridge-pins.js";
export type {
  PinnedExternalEffectOutcome,
  PinnedAmbiguityReason,
  PinnedProviderFailureMetadata,
  PinnedExecutionResultEnvelope,
  PinnedAuthorizedCommand,
  PinnedExecutionMode,
} from "./bridge-pins.js";
