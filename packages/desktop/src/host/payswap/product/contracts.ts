/**
 * PaySwap Desktop (P7-W2) — the desktop product surface models.
 *
 * The PaySwap product surfaces (non-custodial payment mission surface)
 * composed over the pinned shared contracts: the mission board (five
 * outcome actions with honest dispatchability), the journey honest-state
 * derivation (provider-verified observations ONLY — never submission),
 * the quote disclosure and security-gate views, and the DELEGATED money
 * movement references (typed references to the backend planes that own
 * execution — the desktop never executes and never re-implements an
 * engine).
 *
 * NON-CUSTODY LAW: every balance or state the desktop renders is an
 * OBSERVATION of an external provider, never PaySwap custody.
 */

import type {
  PinnedAmountSpec,
  PinnedMoneyDisplayInput,
  PinnedOutcomeActionId,
  PinnedOutcomeCapabilityState,
  PinnedOutcomeDeploymentContext,
  PinnedQuoteTermsSource,
  PinnedQuoteTermsView,
  PinnedSecurityDecisionView,
  PinnedSecurityGateDecisionSource,
  PinnedStageObservation,
  PinnedProgressTimelineView,
} from "../pins/index.js";
import type { DesktopPinProvenance } from "../pins/index.js";

// ---------------------------------------------------------------------------
// Deployment facts (what THIS desktop deployment actually has)
// ---------------------------------------------------------------------------

/**
 * What the PaySwap Desktop deployment actually has configured — the honest
 * inputs of the mission board fold. Extends the pinned outcome deployment
 * context with the desktop's own session-scoped facts. UI state is NEVER
 * an input here: a fact is a fact about configured authority planes.
 */
export interface PaySwapDesktopDeploymentFacts extends PinnedOutcomeDeploymentContext {
  /** Provider-verified observations exist for at least one connected capability. */
  readonly providerObservationsAvailable: boolean;
  /**
   * The backend delegation plane is reachable (the desktop delegates money
   * movement to it; when false the delegate action states its prerequisite).
   */
  readonly delegationPlaneReachable: boolean;
}

// ---------------------------------------------------------------------------
// Mission board (the non-custodial payment mission surface)
// ---------------------------------------------------------------------------

/** One outcome row on the desktop mission board. */
export interface DesktopMissionBoardRow {
  readonly actionId: PinnedOutcomeActionId;
  readonly label: string;
  readonly outcomeLine: string;
  readonly advancedDisclosure: readonly string[];
  /** The honest dispatchability fact for THIS deployment (never a UI mood). */
  readonly capability: PinnedOutcomeCapabilityState;
  /**
   * The desktop affordance: "delegate" (hand the journey to the backend
   * plane via typed reference) when dispatchable, otherwise the typed
   * prerequisite — never a dead button, never a fabricated success.
   */
  readonly affordance:
    | { readonly kind: "DELEGATE_JOURNEY"; readonly journeyId: string }
    | { readonly kind: "UNAVAILABLE"; readonly missingPrerequisite: string };
}

/** The full mission board view (the PaySwap desktop home surface). */
export interface DesktopMissionBoardView {
  readonly rows: readonly DesktopMissionBoardRow[];
  /**
   * The honest empty-state line when no provider observations exist: the
   * board renders the designed empty state, never an exception.
   */
  readonly emptyStateNote: string | undefined;
  readonly pin: DesktopPinProvenance;
}

// ---------------------------------------------------------------------------
// Journey honest states (derive from provider-verified observations ONLY)
// ---------------------------------------------------------------------------

/**
 * The desktop journey state vocabulary — DERIVED from provider-verified
 * observations (the pinned three-value outcome + attempt lifecycle),
 * never from submission. This is the desktop's honest-states law in one
 * type: `CONFIRMED` renders as confirmed; `UNKNOWN` renders as
 * reconciling (NEITHER failure NOR success); `FAILED` renders as failed
 * (retry only as a NEW intent — never a blind retry); `PENDING_OBSERVATION`
 * means the provider has not yet been observed.
 */
export type DesktopJourneyObservationState =
  | "PENDING_OBSERVATION"
  | "CONFIRMED"
  | "UNKNOWN_RECONCILING"
  | "FAILED";

/** Which provider-verified observation a journey state derived from. */
export interface DesktopJourneyObservationInput {
  /** The journey (attempt/operation) this observation is about. */
  readonly journeyRef: string;
  /**
   * The provider-verified envelope outcome (CONFIRMED/UNKNOWN/FAILED).
   * ABSENT means no provider-verified observation has arrived yet: only an
   * in-flight attempt record may then be rendered (PENDING_OBSERVATION —
   * in progress, never a success); anything else fails closed.
   */
  readonly outcome?: "CONFIRMED" | "UNKNOWN" | "FAILED";
  /** The pinned attempt lifecycle state recorded by the protocol authority. */
  readonly attemptState?: "PENDING" | "IN_FLIGHT" | "OUTCOME_UNKNOWN" | "SUCCEEDED" | "FAILED";
  /** The authoritative record reference (the desktop never owns the record). */
  readonly authorityRecordRef: string;
  readonly evidenceRefs: readonly string[];
  readonly observedAt: string;
}

/** One journey's honest desktop view. */
export interface DesktopJourneyStateView {
  readonly journeyRef: string;
  readonly state: DesktopJourneyObservationState;
  /** The pinned surface tone law (UNKNOWN -> warning, FAILED -> danger, CONFIRMED -> success, in-progress -> neutral). */
  readonly tone: "neutral" | "success" | "warning" | "danger";
  /** People-language headline derived from the provider-verified state. */
  readonly headline: string;
  readonly authorityRecordRef: string;
  readonly evidenceRefs: readonly string[];
  readonly observedAt: string;
  readonly pin: DesktopPinProvenance;
}

// ---------------------------------------------------------------------------
// Quote disclosure + security gate (pinned folds, desktop-stamped)
// ---------------------------------------------------------------------------

/** The desktop quote disclosure fold input (clock explicit, never ambient). */
export interface DesktopQuoteDisclosureInput {
  readonly source: PinnedQuoteTermsSource;
  readonly now: string;
  readonly display: PinnedMoneyDisplayInput;
}

export type DesktopQuoteDisclosureView = PinnedQuoteTermsView & {
  readonly pin: DesktopPinProvenance;
};

/** The desktop security gate fold input. */
export type DesktopSecurityGateInput = PinnedSecurityGateDecisionSource;

export type DesktopSecurityGateView = PinnedSecurityDecisionView;

// ---------------------------------------------------------------------------
// Progress timeline (pinned fold, desktop-stamped)
// ---------------------------------------------------------------------------

export type DesktopProgressTimelineView = PinnedProgressTimelineView;

/** The desktop progress fold input: stage observations + explicit clock. */
export interface DesktopProgressFoldInput {
  readonly observations: readonly PinnedStageObservation[];
  readonly now: string;
}

// ---------------------------------------------------------------------------
// Delegated money movement (typed references ONLY — no parallel engine)
// ---------------------------------------------------------------------------

/**
 * The typed reference the desktop delegates money movement through. The
 * backend plane (economic intake -> protocol -> provider runtime) owns
 * execution; the desktop holds ONLY the reference. Constructing this
 * object performs NO movement and implies NO authorization.
 */
export interface DesktopDelegatedMovementRef {
  /** The journey id (from the pinned outcome registry) being delegated. */
  readonly journeyId: string;
  /** The economic intent reference the backend plane recorded (opaque). */
  readonly intentRef: string;
  /** The authorization lineage reference backing the movement (opaque). */
  readonly authorization: {
    readonly artifactId: string;
    readonly mandateRef: string;
    readonly approverRef: string;
    readonly epoch: string;
    readonly artifactHash?: string;
  };
  /** Exact amount as declared to the backend plane (never desktop-computed). */
  readonly declaredAmount: PinnedAmountSpec;
  /** When the delegation reference was issued (ISO-8601 string). */
  readonly issuedAt: string;
}

/** The receipt returned when the desktop forwards a delegation reference. */
export interface DesktopDelegationReceipt {
  readonly journeyId: string;
  readonly intentRef: string;
  /** The backend plane that took ownership (named, never guessed). */
  readonly acceptedBy: "economic-intent-plane" | "quote-projection-plane" | "merchant-checkout-plane";
  /** Submission acknowledgement ONLY — never finality, never success. */
  readonly acknowledgementNote: string;
  readonly issuedAt: string;
  readonly pin: DesktopPinProvenance;
}
