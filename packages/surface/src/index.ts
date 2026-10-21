/**
 * @payswap/surface — the framework-independent, versioned PaySwap Surface
 * contracts and capability/operation discovery projections (P2-W3).
 *
 * Public surface (contracts + pure projection functions; no rendering, no
 * DOM, no network, no framework, zero runtime dependencies — INV-22/INV-27):
 * the Web (P7-W1), Desktop (P7-W2), mobile, extension, SDK and
 * external-agent surfaces (P7-W3) all consume THIS package.
 *
 * NOT exported from this index (deliberately): nothing. Every module is
 * public surface contract; internals live only inside module closures.
 */

export const PACKAGE_NAME = "@payswap/surface" as const;

export {
  SURFACE_API_VERSION,
  surfaceProvenance,
  type SurfaceContractProvenance,
  type SurfaceStability,
} from "./version.ts";

export {
  type AmountSpec,
  InvalidSurfaceAmountError,
  isSurfaceAmountSpec,
  requireSurfaceAmountSpec,
  validateSurfaceAmountSpec,
} from "./amount-spec.ts";

export {
  type DisplayLocaleInput,
  type MoneyDisplayInput,
  type MinorUnitDigitsSource,
  formatMinorUnits,
  formatMoneyAmount,
  minorUnitsSortKey,
  resolveMinorUnitDigits,
} from "./money-view.ts";

export {
  type OutcomeActionId,
  type OutcomeAction,
  type OutcomeCapabilityState,
  type OutcomeDeploymentContext,
  type OutcomeDispatchAuthority,
  OUTCOME_REGISTRY,
  outcomeActionById,
  outcomeCapabilityBoard,
} from "./outcomes.ts";

export {
  type UniversalAreaId,
  type UniversalArea,
  type AreaEmptyStateContract,
  UNIVERSAL_AREAS,
  UNIVERSAL_AREA_IDS,
  universalAreaById,
} from "./areas.ts";

export {
  type OutcomeAreaAlias,
  OUTCOME_AREA_ALIASES,
  outcomeAreaAlias,
} from "./outcome-area-aliases.ts";

export {
  type QuoteFeeBasis,
  type QuoteFeeLine,
  type DeliveryEstimateKind,
  type QuoteDeliveryEstimate,
  type QuoteRate,
  type QuoteExpiry,
  type QuoteFundingAssumption,
  type QuoteRecipientAssumption,
  type QuoteConditions,
  type QuoteTermsSource,
  type QuoteFoldInput,
  type QuoteFreshness,
  type QuoteTermsView,
  InvalidQuoteTermsError,
  foldQuoteTerms,
} from "./quote-terms.ts";

export {
  type SurfaceProgressStage,
  type StageStatus,
  type StageObservation,
  type StageTone,
  type StageView,
  type ProgressFoldInput,
  type ProgressFacts,
  type ProgressTimelineView,
  SURFACE_PROGRESS_STAGES,
  InvalidProgressObservationError,
  foldProgressTimeline,
} from "./progress-states.ts";

export {
  type AuthorizationChangeKind,
  type AuthorizationChangeClass,
  type AuthorizationChangeRecord,
  type AuthorizationChangeView,
  AUTHORIZATION_CHANGE_KINDS,
  InvalidAuthorizationChangeError,
  foldAuthorizationChange,
} from "./authorization-changes.ts";

export {
  type RequiredFieldState,
  type OperationRequiredField,
  type OperationLimits,
  type ObservationFreshness,
  type CapabilityOperationSource,
  type DiscoveryFoldInput,
  type OperationDiscoveryRow,
  type OperationDiscoveryView,
  InvalidDiscoverySourceError,
  foldOperationDiscovery,
} from "./discovery.ts";

export {
  type CorridorCapabilityRef,
  type CorridorSource,
  type CorridorCoverageRow,
  type CorridorCoverageView,
  InvalidCorridorSourceError,
  foldCorridorCoverage,
} from "./corridor-coverage.ts";

export {
  type GatePresentationTone,
  type GateBlockReason,
  type GateAllowCheck,
  type GateUnknownDimension,
  type SecurityGateDecisionSource,
  type SecurityDecisionView,
  type SurfaceModeIndicator,
  foldSecurityDecision,
  modeIndicator,
} from "./security-vocabulary.ts";

export {
  type ConsoleSectionId,
  type ConsoleSection,
  type ConsoleRouteResolution,
  WORKSPACE_SECTIONS,
  CONSOLE_SECTION_IDS,
  CONSOLE_ROOT_TITLE,
  CONSOLE_TITLE_SUFFIX,
  CONSOLE_ADVANCED_ROUTE,
  CONSOLE_ADVANCED_LABEL,
  consoleSectionById,
  resolveConsoleSection,
  consoleDocumentTitle,
} from "./console-workspace.ts";

export {
  type MissionIntentDirection,
  type MissionIntakeInput,
  type MissionDraftStatus,
  type MissionLifecycleRung,
  type MissionRungState,
  type MissionEventKind,
  type MissionEvent,
  type MissionStructuralValidation,
  type MissionRecord,
  type MissionSummary,
  type MissionDetail,
  MISSION_INTENT_DIRECTIONS,
  MISSION_DRAFT_STATUSES,
  MISSION_EVENT_KINDS,
  MISSION_LIFECYCLE_RUNGS,
  InvalidConsoleMissionError,
  validateMissionIntake,
  validateMissionRecordShape,
  missionSummaryOf,
} from "./console-missions.ts";

export {
  MISSION_PREREQUISITE_INTENT,
  MISSION_PREREQUISITE_ELIGIBILITY,
  MISSION_PREREQUISITE_PLANNING,
  MISSION_PREREQUISITE_APPROVAL,
  MISSION_PREREQUISITE_EXECUTION,
  MISSION_PREREQUISITE_OBSERVATION,
  MISSION_PREREQUISITE_EVIDENCE,
  foldMissionLadder,
  foldMissionDetail,
} from "./console-ladder.ts";

export {
  type WorkspaceStoreDurability,
  type WorkspaceStorePort,
  WORKSPACE_STORE_DURABILITY_LABELS,
  WORKSPACE_STORE_DEMAND_SIDE_LAW,
  InvalidWorkspaceStoreError,
  workspaceStoreDurabilityLabel,
} from "./console-store.ts";

export {
  type TaggedMissionEvent,
  type WorkspaceOverviewAttention,
  type WorkspaceEmptyState,
  type WorkspaceOverviewView,
  type ConsoleSectionEmptyReasonId,
  type ConsoleSectionEmptyState,
  type ConsoleConnectionCoverageFact,
  WORKSPACE_OVERVIEW_RECENT_EVENTS_CAP,
  InvalidOverviewRecordError,
  foldWorkspaceOverview,
  CONSOLE_SECTION_EMPTY_STATES,
  consoleSectionEmptyState,
  NO_EVIDENCE_COVERAGE,
  NO_EVIDENCE_COVERAGE_NOTE,
} from "./console-sections.ts";

export {
  type ConsoleReferenceEntry,
  type ConsoleReferenceVocabulary,
  type WorkspaceSettingsFacts,
  LAB_ADVISORY_LAW,
  AGENT_CONTRACT_VOCABULARY,
  APPROVAL_VOCABULARY,
  CONNECTION_LIFECYCLE_VOCABULARY,
  ACTIVITY_OUTCOME_STATE_REFERENCE,
  LAB_REFERENCE_VOCABULARY,
  InvalidWorkspaceSettingsError,
  foldWorkspaceSettingsFacts,
} from "./console-vocabularies.ts";
