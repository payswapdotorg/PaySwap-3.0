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
