/**
 * PaySwap Desktop (P7-W2 + P10-B) — the product barrel.
 *
 * The PaySwap Desktop product surfaces composed over the pinned shared
 * contracts: the mission board fold, the journey honest-states derivation,
 * the quote disclosure fold, the security gate fold, the progress timeline
 * fold, exact money display, the delegated money-movement law — and, since
 * P10-B, the console mission-intake folds + the DESKTOP_PROFILE workspace
 * store core and its JSON snapshot persistence.
 */

export { foldDesktopMissionBoard } from "./mission-surface.js";
export { deriveDesktopJourneyState } from "./honest-states.js";
export { foldDesktopQuoteTerms } from "./quote-terms.js";
export { foldDesktopSecurityDecision } from "./security-gate.js";
export { foldDesktopProgressTimeline } from "./progress-timeline.js";
export {
  formatDesktopMoneyAmount,
  resolveDesktopMinorUnitDigits,
} from "./money-view.js";
export { delegateDesktopMoneyMovement } from "./delegation.js";

export {
  validatePinnedMissionIntake,
  foldPinnedMissionLadder,
  pinnedMissionIntentReached,
  pinnedMissionSummaryOf,
  pinnedMissionRecordStructureFinding,
} from "./mission-intake.js";
export { createWorkspaceStoreCore, WorkspaceStoreError } from "./workspace-store.js";
export type {
  WorkspaceStoreCore,
  WorkspaceStoreCoreState,
  WorkspaceStoreErrorKind,
} from "./workspace-store.js";
export {
  openPersistentWorkspaceStore,
} from "./workspace-store-persistence.js";
export type {
  PersistentWorkspaceStore,
  WorkspaceStoreFileSystem,
  WorkspaceStoreHealthReport,
  WorkspaceStoreQuarantineEntry,
} from "./workspace-store-persistence.js";

export type {
  PaySwapDesktopDeploymentFacts,
  DesktopMissionBoardRow,
  DesktopMissionBoardView,
  DesktopJourneyObservationState,
  DesktopJourneyObservationInput,
  DesktopJourneyStateView,
  DesktopQuoteDisclosureInput,
  DesktopQuoteDisclosureView,
  DesktopSecurityGateInput,
  DesktopSecurityGateView,
  DesktopProgressTimelineView,
  DesktopProgressFoldInput,
  DesktopDelegatedMovementRef,
  DesktopDelegationReceipt,
} from "./contracts.js";
