/**
 * PaySwap Desktop (P7-W2) — the product barrel.
 *
 * The PaySwap Desktop product surfaces composed over the pinned shared
 * contracts: the mission board fold, the journey honest-states derivation,
 * the quote disclosure fold, the security gate fold, the progress timeline
 * fold, exact money display, and the delegated money-movement law.
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
