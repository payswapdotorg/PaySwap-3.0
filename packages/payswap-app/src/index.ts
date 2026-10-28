/**
 * @payswap/app — the public API of the PaySwap product application.
 *
 * NET-NEW (P9-A): the PaySwap product moved out of @zcode/web/src/payswap
 * into this standalone package so the WEB mount (@zcode/web) and the
 * DESKTOP renderer (@zcode/desktop) consume ONE product surface. The
 * package is PRESENTATIONAL with injected platform/data adapters: pages
 * render from explicit view inputs (no fetch, no ambient session state —
 * INV-23 projection law at the product boundary).
 *
 * Consumers bring:
 * - the design layer: @zcode/ui/payswap (tokens + primitives);
 * - the platform mount: a navigation adapter (web: history; desktop:
 *   hash) + the honest deployment facts for the runtime.
 */

// Route table (PRODUCT-IDENTITY.md §3 — the canonical route contract).
export {
  PAYSWAP_CONSOLE_PATH,
  PAYSWAP_LEGACY_PREFIX,
  isPaySwapLegacyPath,
  isPaySwapProductPath,
  resolvePaySwapLegacyRedirect,
  resolvePaySwapRoute,
  routeDocumentTitle,
  type PaySwapRoute,
} from "./routes.js";

// The product shell + its input contract.
export { PaySwapApp, type PaySwapAppProps, type PaySwapProductInput } from "./shell/PaySwapApp.js";
export {
  AppAreaNav,
  ConsoleLink,
  SiteFooter,
  SiteHeader,
  SiteNav,
  type PaySwapConsoleEntry,
} from "./shell/SiteChrome.js";
export { ProductLink, type ProductLinkProps } from "./shell/ProductLink.js";
export {
  createStaticNavigation,
  type PaySwapNavigation,
} from "./shell/navigation.js";

// The PaySwap Agent Workspace (console surface, Phase 10 —
// spec/surface/CONSOLE-WORKSPACE.md). The component + port types are the
// cross-lane seam the desktop renderer mount and the web console mount
// compile against; P10-C owns the implementation under src/console/.
export {
  PaySwapAgentWorkspace,
  type PaySwapAgentWorkspaceProps,
  type MissionDetail,
  type MissionDraftStatus,
  type MissionEvent,
  type MissionEventKind,
  type MissionIntakeInput,
  type MissionIntentDirection,
  type MissionLifecycleRung,
  type MissionAmountSpec,
  type MissionRecord,
  type MissionRungState,
  type MissionStructuralValidation,
  type MissionSummary,
  type ModelProviderStatus,
  type WorkspaceStoreDurability,
  type WorkspaceStorePort,
} from "./console/PaySwapAgentWorkspace.js";

// The agent-led payment UX (P13; the public API for the P15 zcode-shell
// integration — the shared typed-intent composer + the entry actions).
export {
  AgentComposer,
  type AgentComposerProps,
} from "./agent/AgentComposer.js";
export {
  PaySwapAgentExperience,
  type PaySwapAgentExperienceProps,
} from "./agent/AgentExperience.js";
export {
  createAgentComposerController,
  resetSharedAgentComposerController,
  sharedAgentComposerController,
  type AgentComposerController,
} from "./agent/agentComposerController.js";
// (P21-B, ADR-0014 D2) The shared mission-intake plane seam: the desktop
// renderer's composition root binds the channel-backed plane BEFORE the
// first shared-controller construction; the web tier binds nothing — the
// honest unbound mission tier (the ADR-0010 D7 analogue).
export {
  MISSION_INTAKE_ASK_NOTE,
  MISSION_INTAKE_COMPLETE_NOTE,
  MISSION_INTAKE_PHASES,
  MISSION_INTAKE_UNBOUND_NOTE,
  MISSION_INTAKE_UNBOUND_STATE,
  type MissionIntakeAsk,
  type MissionIntakePhase,
  type MissionIntakePlanePort,
  type MissionIntakeSeedInput,
  type MissionIntakeSeedOutcome,
  type MissionIntakeState,
} from "./agent/missionIntakePins.js";
export {
  bindSharedMissionIntakePlane,
  resetSharedMissionIntakePlane,
  sharedMissionIntakePlane,
  bindSharedModelCatalog,
  resetSharedModelCatalog,
  sharedModelCatalog,
} from "./agent/agentComposerShared.js";
// (P21-B run 3, ADR-0014 D10) The shared wait re-check plane seam: the
// desktop renderer binds the REAL P21-C evaluator behind the pinned port;
// the web tier binds nothing — the honest not-wired note.
export {
  bindSharedWaitRecheckPlane,
  resetSharedWaitRecheckPlane,
  sharedWaitRecheckPlane,
} from "./agent/waitRecheckShared.js";
export {
  opportunityMatchOfRecheck,
  WAIT_RECHECK_MATCH_NOTE,
  WAIT_RECHECK_UNBOUND_NOTE,
  type WaitRecheckOutcomePin,
  type WaitRecheckPlanePort,
} from "./agent/waitRecheckPins.js";
// (P21-B run 4 / Part E, ADR-0014 D5/D6) The connection-activation
// surface: the pinned port over the channel's key-entry + probe members
// (the desktop composition root binds the REAL channel adapter; the web
// tier binds nothing — the honest unbound note).
export {
  CONNECTIONS_ACTIVATION_PROVIDERS,
  CONNECTIONS_ACTIVATION_SEAL_NOTE,
  CONNECTIONS_ACTIVATION_TIER_NOTE,
  CONNECTIONS_ACTIVATION_UNBOUND_NOTE,
  CONNECTIONS_PROBE_EVIDENCE_TIER,
  CONNECTIONS_PROBE_OUTCOMES,
  type ConnectionsActivationPort,
  type ConnectionsActivationProviderId,
  type ConnectionsProbeOutcomeKind,
  type ConnectionsProbeOutcomePin,
  type ConnectionsProbeResultPin,
  type ConnectionsSealReceiptPin,
  type ConnectionsSeedOutcomePin,
  type ConnectionsStatusPin,
} from "./console/connectionsActivationPins.js";
export {
  bindSharedConnectionsActivationPlane,
  resetSharedConnectionsActivationPlane,
  sharedConnectionsActivationPlane,
} from "./console/connectionsActivationShared.js";
export { ConnectionsActivationPanel } from "./console/sections/ConnectionsActivationPanel.js";
// (P21-B, ADR-0014 D4) The model/difficulty controls surface: the catalog
// port + the pinned budget mapping the desktop composition derives its
// REAL engine budgets from; the web tier binds nothing — the honest
// unbound catalog note.
export {
  AGENT_TASK_MODEL_DISCLOSURE_NOTE_PIN,
  AGENT_TASK_REASONING_LEVELS_PIN,
  MODEL_CATALOG_UNBOUND_NOTE,
  MODEL_CONTROLS_UNBOUND_STATE,
  MODEL_CONTROL_PHASES,
  ModelSelectionControlError,
  modelBudgetOf,
  requireValidModelSelectionPin,
  type AgentTaskModelSelectionPin,
  type CatalogModel,
  type ModelCatalogPort,
  type ModelControlPhase,
  type ModelControlsState,
  type ModelExplanationDetail,
  type ModelScenarioBudgetPin,
  type ModelSearchBudgetPin,
  type PinnedReasoningLevel,
  type ReasoningLevelBudget,
} from "./agent/taskModelPins.js";
export {
  routeAgentText,
  AGENT_INTENT_UNKNOWN_REPLY,
} from "./agent/intentRouter.js";
// The route-planning composition surface (P17-B; ADR-0010 D5): the
// platform host's composition root binds the REAL route-planning engines
// behind the fail-closed engine port AND the session that records the
// choices — both through module-level seams on the mount. Until a host
// binds them, the app's defaults stay honest (the unbound-engine note +
// the not-wired choice notes). The app src itself stays pin-only
// (product law P2 — zero @payswap/* imports, machine-checked).
export {
  bindRoutePlanningEngine,
  bindRoutePlanningSession,
  resetSharedRoutePlanningEngine,
  resetSharedRoutePlanningSession,
  sharedRoutePlanningEngine,
  sharedRoutePlanningSession,
} from "./agent/RoutePlanningMount.js";
export {
  createBrowserAgentTaskSessionPort,
  type AgentTaskSessionStorage,
} from "./agent/taskSessionAdapter.js";
export type { AgentTaskSessionPort } from "./agent/taskSessionPort.js";
export {
  createRoutePlanningSession,
  type RoutePlanningSession,
  type RoutePlanningSessionOptions,
} from "./agent/routePlanningSession.js";
// The stage-progress projection surface (P21-B, ADR-0014 D3): the pure
// twelve-stage checklist derived from persisted typed events + the engine
// view (never a parallel state model), the ROUTINE_PINNED recorder (stage
// 0's typed result), and the structural pins of the surface's routine-
// stage contract (the ONE workflow vocabulary — mirror-verified).
export {
  projectRoutineStageProgress,
  type RoutineStageMissionEventPin,
  type RoutineStageMissionFacts,
  type RoutineStageProjectionInput,
  type RoutineStageTaskEventPin,
  type RoutePlanningMissionFactsSource,
} from "./agent/routineStageProjection.js";
export {
  parseRoutinePinSummary,
  recordRoutinePin,
  routinePinSummary,
  RoutinePinDriftError,
  ROUTINE_PIN_SUMMARY_PREFIX,
  type RoutinePinOutcome,
} from "./agent/routineStagePinning.js";
export {
  AGENT_ROUTINE_STAGE_IDS_PIN,
  AGENT_ROUTINE_STAGES_PIN,
  AGENT_TASK_STAGE_STATUSES_PIN,
  ROUTINE_STAGE_PANEL_UNBOUND_NOTE,
  ROUTINE_STAGE_STATUS_LABELS_PIN,
  type AgentRoutineStageDeclarationPin,
  type AgentRoutineStageIdPin,
  type AgentTaskStageProgressPin,
  type AgentTaskStageStatusPin,
} from "./agent/routineStagePins.js";
export { RoutineStagePanel } from "./agent/RoutineStagePanel.js";
export {
  isRoutePlanningNoIntentError,
  RoutePlanningNoIntentError,
  routePlanningViewDigestOf,
  type RoutePlanningEnginePort,
  type RoutePlanningEngineRequest,
  type RoutePlanningEngineView,
  type RoutePlanningOpportunityMatchPin,
  type RoutePlanningWaitCriteriaPin,
  type AmountSpecPin,
  type FundsLocationRefPin,
  type IntentConstraintsPin,
  type MoneyMovementIntentPin,
  type PaymentIntentPin,
} from "./agent/routePlanningPins.js";
// The payment-missions observation surface (P18-B; ADR-0011 D1): the
// platform host's composition root binds the mission-plane channel
// members behind the pinned PaymentMissionsPort through the mount's
// module-level seam; until a host binds it, the board renders the
// honest not-wired note (never fabricated missions, never an error).
// The app src stays pin-only (product law P2 — machine-checked).
export {
  bindPaymentMissionsPort,
  PaymentMissionsMount,
  resetSharedPaymentMissionsPort,
  sharedPaymentMissionsPort,
  type PaymentMissionsMountProps,
} from "./agent/PaymentMissionsMount.js";
export {
  isPaymentMissionsPlaneNotConfigured,
  PaymentMissionsPlaneNotConfiguredError,
  PAYMENT_MISSIONS_ATTEMPT_OPERATION_LABELS,
  PAYMENT_MISSIONS_ATTEMPT_OUTCOME_LABELS,
  PAYMENT_MISSIONS_ATTEMPT_OUTCOMES_PIN,
  PAYMENT_MISSIONS_DIRECTIONS_PIN,
  PAYMENT_MISSIONS_FIELD_IDS_PIN,
  PAYMENT_MISSIONS_STATUSES_PIN,
  PAYMENT_MISSIONS_VIEW_KINDS,
  type PaymentMissionsApprovalRequest,
  type PaymentMissionsApprovalResolution,
  type PaymentMissionsApprovalScope,
  type PaymentMissionsApprovalState,
  type PaymentMissionsAmount,
  type PaymentMissionsAttemptOutcome,
  type PaymentMissionsAttemptState,
  type PaymentMissionsBoardItem,
  type PaymentMissionsCompiledIntent,
  type PaymentMissionsDetail,
  type PaymentMissionsDetailState,
  type PaymentMissionsDirection,
  type PaymentMissionsEvent,
  type PaymentMissionsFundsLocation,
  type PaymentMissionsGateDecision,
  type PaymentMissionsIntakeFieldState,
  type PaymentMissionsIntakeFields,
  type PaymentMissionsFieldId,
  type PaymentMissionsPlanSelection,
  type PaymentMissionsPort,
  type PaymentMissionsPreview,
  type PaymentMissionsPreviewGates,
  type PaymentMissionsStatus,
  type PaymentMissionsView,
  type PaymentMissionsViewKind,
} from "./agent/paymentMissionsPins.js";
// The payment-missions dispatch surface (P19-B; ADR-0012 D1): the armed
// card + the two-act dispatch flow over the composed dispatch-capable
// port — the lane choice and the send confirm fire dispatch with
// EXACTLY (missionId, connectionRef); the authorization artifact never
// crosses onto any shape. The structural guard keeps the P18 seam law:
// a P18-only port renders the honest dispatch-unavailable note.
export {
  isPaymentMissionsDispatchPort,
  PAYMENT_MISSIONS_DISPATCH_OUTCOME_KINDS,
  PAYMENT_MISSIONS_DISPATCH_OUTCOME_LABELS,
  PAYMENT_MISSIONS_DISPATCH_PHASES,
  type PaymentMissionsArmedEffect,
  type PaymentMissionsDispatchOutcome,
  type PaymentMissionsDispatchOutcomeKind,
  type PaymentMissionsDispatchPhase,
  type PaymentMissionsDispatchState,
  type PaymentMissionsDispatchWiring,
  type PaymentMissionsExecLane,
  type PaymentMissionsPortWithDispatch,
} from "./agent/paymentMissionsDispatchPins.js";
export {
  PaymentMissionsArmedCard,
  type PaymentMissionsArmedCardProps,
} from "./agent/PaymentMissionsArmedCard.js";
// The payment-missions reconciliation surface (P20-B; ADR-0013 D1/D2):
// the pending-reconciliation read + the two-act evidence entry over the
// composed reconciliation-capable port — the direction, the source kind
// and the provider references fire reconcile with EXACTLY
// (missionId, attemptId, evidence); the runtime verb stays the only
// closer of an unknown outcome (the operator is the courier of the
// provider's evidence, never its source). The structural guard keeps
// the P18 seam law: a port without the members renders the honest
// reconciliation-unavailable note.
export {
  isPaymentMissionsReconciliationPort,
  PAYMENT_MISSIONS_RECONCILIATION_DIRECTION_LABELS,
  PAYMENT_MISSIONS_RECONCILIATION_DIRECTIONS,
  PAYMENT_MISSIONS_RECONCILIATION_SOURCE_LABELS,
  PAYMENT_MISSIONS_RECONCILIATION_SOURCES,
  PAYMENT_MISSIONS_RECONCILE_PHASES,
  type PaymentMissionsPendingAttempt,
  type PaymentMissionsPendingReconciliation,
  type PaymentMissionsPortWithReconciliation,
  type PaymentMissionsReconcileEvidence,
  type PaymentMissionsReconcileOutcome,
  type PaymentMissionsReconcilePhase,
  type PaymentMissionsReconcileState,
  type PaymentMissionsReconcileWiring,
  type PaymentMissionsReconciliationDirection,
  type PaymentMissionsReconciliationSource,
} from "./agent/paymentMissionsReconcilePins.js";
export {
  PaymentMissionsReconcileCard,
  type PaymentMissionsReconcileCardProps,
} from "./agent/PaymentMissionsReconcileCard.js";
// The payment-missions verification surface (the P21-D reviewer-gate,
// Gap C): the single-act authoritative read-back over the composed
// verification-capable port — the host performs the provider retrieval
// inside the credential seal (no evidence entry exists; no ambiguity
// ever existed on a CONFIRMED attempt); the verification is a typed
// persisted fact, never a new outcome and never a substitute for
// reconciliation (an ambiguous attempt refuses typed — the reviewer's
// law — and the refusal propagates to the surface's flow-error line).
// A port without the member keeps the verify card unrendered (the
// honest unbound tier, never a dead button).
export {
  isPaymentMissionsVerificationPort,
  PAYMENT_MISSIONS_VERIFICATION_CARD_NOTE,
  PAYMENT_MISSIONS_VERIFY_PHASES,
  type PaymentMissionsAttemptVerification,
  type PaymentMissionsPortWithVerification,
  type PaymentMissionsVerifyPhase,
  type PaymentMissionsVerifyState,
  type PaymentMissionsVerifyWiring,
} from "./agent/paymentMissionsVerifyPins.js";
export {
  PaymentMissionsVerifyCard,
  type PaymentMissionsVerifyCardProps,
} from "./agent/PaymentMissionsVerifyCard.js";
export {
  usePaymentMissionsVerifyFlow,
  type PaymentMissionsVerifyFlow,
} from "./agent/paymentMissionsVerifyFlow.js";
export {
  AGENT_PAYMENT_DIRECTION_ENTRIES,
  agentPaymentDirectionEntries,
  type AgentPaymentDirectionEntry,
} from "./lib/agent-payment-entries.js";
export {
  agentProviderSetupCards,
  type AgentProviderSetupCard,
} from "./lib/agent-provider-entries.js";

// The honest harness facts (the deployment truth this repository phase).
export {
  HONEST_DEPLOYMENT_CONTEXT,
  NO_EVIDENCE_COVERAGE,
  WEB_ORACLE_HARNESS,
  WEB_ORACLE_HARNESS_VERSION,
  type WebOracleHarness,
} from "./contracts/harness.js";

// View-model contracts (typed projections consumers build inputs against).
export type {
  CoverageSource,
  CoverageView,
  DevelopersPageView,
  HomePageView,
  NavigationAreaView,
  NavLink,
  OutcomeBoardRow,
  OutcomeBoardView,
} from "./contracts/view-models.js";

// The console-sections bridge for a HOST SHELL (P15 — the ZCode
// workspace integration): the PaySwap Agent Workspace's sections
// rendered inside the host's main content area, over the restored
// BROWSER_PROFILE workspace store (the P10-B laws, new home).
export {
  PaySwapConsoleSections,
  type PaySwapConsoleSectionsProps,
} from "./console/PaySwapConsoleSections.js";
export {
  PAYSWAP_CONSOLE_NAV_GROUP_LABEL,
  PAYSWAP_CONSOLE_NAV_ITEMS,
  paySwapConsoleNavLabel,
  type PaySwapConsoleNavDescriptor,
} from "./console/consoleNav.js";
export {
  createBrowserWorkspaceStore,
  BrowserWorkspaceStoreError,
  WORKSPACE_STORE_LOCALSTORAGE_KEY,
  type BrowserWorkspaceStorage,
  type BrowserWorkspaceStore,
  type BrowserWorkspaceStoreErrorKind,
  type BrowserWorkspaceStoreHealthReport,
  type BrowserWorkspaceStoreQuarantineEntry,
} from "./console/browserWorkspaceStore.js";
export {
  createMemoryNavigation,
} from "./console/memoryNavigation.js";
