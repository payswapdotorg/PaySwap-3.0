/**
 * @payswap/app — STRUCTURAL PINS of the payment-missions observation
 * surface (P18-B, ADR-0011 D1/D2/D3).
 *
 * MIRROR DISCIPLINE (the routePlanningPins.ts pattern, product law P2):
 * @payswap/app src NEVER imports a @payswap/* workspace package or the
 * desktop host — every cross-package surface is pinned STRUCTURALLY here
 * (same literals, same frozen vocabularies). The mirrored source of record is
 * the payswap-desktop channel contract (shell/payment-mission-contracts.ts
 * + the P18-A approval DTOs) — READ-ONLY reference, never imported; the
 * TL's renderer composition (P18-C) binds the REAL channel members behind
 * this port and reconciles any drift.
 *
 * LAWS (ADR-0011): this surface OBSERVES the mission plane and renders the
 * two-act approval flow — it never fires a dispatch (D3: an approved
 * mission sits ARMED until a host-side dispatch consumes the approval).
 * The approval act crosses only as requestApproval/resolveApproval with the
 * origin PINNED at the channel edge (D2); the single-use authorization
 * artifact NEVER crosses onto any shape pinned here (no artifactId key
 * exists below). THE SCAN-CLEAN LAW (P16-D): no pinned string below
 * carries an authority-surface machine literal (AUTHORIZATION_GRANTED,
 * AUTHORIZATION_DECLINED, PLAN_SELECTION_RECORDED or any event-kind
 * literal) — people language only; the host's event-kind vocabulary is
 * deliberately NOT mirrored (the timeline renders the people-language
 * summaries, never the machine kinds). ZERO ambient clock/random — every
 * instant arrives on a DTO.
 */

/* ==== the mission vocabulary pins (directions, statuses, intake fields) ==== */

/** Mirrors PAYMENT_MISSION_DIRECTIONS / PAYMENT_TASK_STATUSES / PAYMENT_INTAKE_FIELD_IDS
 * (the four directions; the task lifecycle the board renders verbatim; the nine
 * required intake fields in canonical ask order). */
export const PAYMENT_MISSIONS_DIRECTIONS_PIN = Object.freeze([
  "PAY", "RECEIVE", "MOVE", "CONVERT",
] as const);
export type PaymentMissionsDirection = (typeof PAYMENT_MISSIONS_DIRECTIONS_PIN)[number];

export const PAYMENT_MISSIONS_STATUSES_PIN = Object.freeze([
  "DRAFT", "ACTIVE", "AWAITING_EXTERNAL_RETURN", "PAUSED",
  "WAITING_FOR_OPPORTUNITIES", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED",
] as const);
export type PaymentMissionsStatus = (typeof PAYMENT_MISSIONS_STATUSES_PIN)[number];

export const PAYMENT_MISSIONS_FIELD_IDS_PIN = Object.freeze([
  "amountAndCurrency", "fundingSource", "recipient", "countryCorridor",
  "speedDeadline", "feeCap", "purpose", "privacyCompliance", "partialPaymentPreference",
] as const);
export type PaymentMissionsFieldId = (typeof PAYMENT_MISSIONS_FIELD_IDS_PIN)[number];

/** Mirrors PaymentAmountSpec — exact money (a canonical integer string, never a float). */
export interface PaymentMissionsAmount {
  readonly currency: string;
  readonly minorUnits: string;
}

/** One intake field's state (SUBSET pin of PaymentIntakeFieldState): MISSING
 * until an explicit capture exists. The captured value is UNKNOWN to this
 * surface — the per-field typed shapes stay host-side; the detail view
 * renders them defensively, never guessing (no default is ever applied). */
export type PaymentMissionsIntakeFieldState =
  | { readonly status: "MISSING" }
  | { readonly status: "CAPTURED"; readonly value: unknown };

/** The nine-field intake state (SUBSET pin of PaymentIntakeFieldStates). */
export type PaymentMissionsIntakeFields = Readonly<
  Record<PaymentMissionsFieldId, PaymentMissionsIntakeFieldState>
>;

/* ==== the timeline event + compiled 11-key intent pins (read-only rendering) ==== */

/** One append-only timeline event (mirrors PaymentMissionEventDto). The
 * host's event-kind vocabulary is deliberately NOT mirrored: `kind` is an
 * OPAQUE string this surface never renders — the timeline shows the
 * people-language summary only, so no authority-surface machine literal can
 * ever reach the DOM (the scan-clean law). */
export interface PaymentMissionsEvent {
  readonly id: string;
  /** ISO-8601 UTC instant — DATA, never ambient. */
  readonly at: string;
  /** Opaque host-side machine kind — rendered never; see the header law. */
  readonly kind: string;
  /** People-language summary (rendered verbatim). */
  readonly summary: string;
  readonly correlationRef?: string;
}

/** Mirrors CanonicalFundsLocationRef — a reference, never a balance (INV-7). */
export interface PaymentMissionsFundsLocation {
  readonly locationRef: string;
  readonly currency: string;
  readonly observationRef: string;
}

/** Mirrors CompiledPaymentIntent — the canonical 11-field ADVISORY demand record. */
export interface PaymentMissionsCompiledIntent {
  readonly intentId: string;
  readonly principalRef: string;
  readonly origin: PaymentMissionsFundsLocation;
  readonly destination: PaymentMissionsFundsLocation;
  readonly originAmount: PaymentMissionsAmount;
  readonly arrivalCurrency: string;
  readonly constraints: { readonly maxSettlementMs: number; readonly maxRouteHops: number };
  readonly intentAuthorizationRef: string;
  /** Declared-at / absolute-expiry instants (ms, DTO-supplied; never ambient). */
  readonly declaredAt: number;
  readonly expiresAt: number;
  readonly commerceRef: string;
}

/* ============ the plan-selection + attempt-state pins (facts only) ============ */

/** Mirrors PaymentMissionPlanSelection — a RECORD, never an authorization. */
export interface PaymentMissionsPlanSelection {
  readonly planId: string;
  readonly viewDigest: string;
  readonly routineId: string;
  readonly routineVersion: string;
  readonly selectedAt: string;
}

/** Mirrors the attempt-state outcome vocabulary (ADR-0011 D3 — outcome facts only). */
export const PAYMENT_MISSIONS_ATTEMPT_OUTCOMES_PIN = Object.freeze([
  "STARTED", "CONFIRMED", "FAILED", "OUTCOME_UNKNOWN", "RECONCILED", "REFUSED",
] as const);
export type PaymentMissionsAttemptOutcome = (typeof PAYMENT_MISSIONS_ATTEMPT_OUTCOMES_PIN)[number];

/** The people-language render of the attempt outcomes and operations (scan-clean). */
export const PAYMENT_MISSIONS_ATTEMPT_OUTCOME_LABELS: Readonly<
  Record<PaymentMissionsAttemptOutcome, string>
> = Object.freeze({
  STARTED: "started",
  CONFIRMED: "confirmed",
  FAILED: "failed",
  OUTCOME_UNKNOWN: "outcome not yet known",
  RECONCILED: "reconciled",
  REFUSED: "refused before any effect",
});

/** Mirrors PaymentMissionAttemptStateDto — the state projection (NO ids/keys/refs beyond the attempt id). */
export interface PaymentMissionsAttemptState {
  readonly attemptId: string;
  readonly startedAt: string;
  readonly operation: string;
  readonly executionMode: "SANDBOX" | "LIVE";
  readonly outcome: PaymentMissionsAttemptOutcome;
  readonly summary: string;
}

/** The people-language renders of the attempt operations. */
export const PAYMENT_MISSIONS_ATTEMPT_OPERATION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  CREATE_EXTERNAL_EFFECT: "create an external effect",
  CANCEL_OR_REVERSE_EFFECT: "cancel or reverse an effect",
});

/* ==== the board + detail + preview/gates pins (the read model) ==== */

/** One board row (mirrors PaymentMissionBoardItemDto — demand-side facts only). */
export interface PaymentMissionsBoardItem {
  readonly missionId: string;
  readonly direction: PaymentMissionsDirection;
  readonly goalStatement: string;
  readonly status: PaymentMissionsStatus;
  readonly hasCompiledIntent: boolean;
  readonly hasPreview: boolean;
  readonly planSelection?: PaymentMissionsPlanSelection;
  readonly updatedAt: string;
}

/**
 * The full mission detail (mirrors PaymentMissionDetailDto + the P18-A
 * attempts projection): timeline, nine intake captures, compiled 11-key
 * intent, preview id, plan selection and the attempt STATES (facts only —
 * no idempotency/command/correlation ids, no connection refs, no
 * authorization artifacts ever cross onto this shape).
 */
export interface PaymentMissionsDetail {
  readonly id: string;
  readonly direction: PaymentMissionsDirection;
  readonly goalStatement: string;
  readonly origin: string;
  readonly status: PaymentMissionsStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly events: readonly PaymentMissionsEvent[];
  readonly fields: PaymentMissionsIntakeFields;
  readonly intent?: PaymentMissionsCompiledIntent;
  readonly previewId?: string;
  readonly planSelection?: PaymentMissionsPlanSelection;
  /** Optional for channel-drift tolerance (absent ≙ no attempts recorded). */
  readonly attempts?: readonly PaymentMissionsAttemptState[];
}

/** One per-gate decision (mirrors PaymentPreviewGateDecisionDto — the reason carried VERBATIM). */
export interface PaymentMissionsGateDecision {
  readonly gate: string;
  readonly decision: "BLOCK" | "PROCEED";
  readonly reason: string;
}

/** The gate aggregate (mirrors PaymentPreviewGatesDto — every BLOCK reason verbatim, in gate order). */
export interface PaymentMissionsPreviewGates {
  readonly decision: "BLOCK" | "PROCEED";
  readonly decisions: readonly PaymentMissionsGateDecision[];
  readonly reasons: readonly string[];
}

/** The presented preview (mirrors PaymentPreviewDto — the honest BLOCK is the surfaced outcome). */
export interface PaymentMissionsPreview {
  readonly previewId: string;
  readonly missionId: string;
  readonly gates: PaymentMissionsPreviewGates;
  readonly dispatchable: boolean;
  readonly presentedAt: string;
  readonly planSelection?: PaymentMissionsPlanSelection;
}

/* ============ the two-act approval pins (ADR-0011 D2 — the scope echo) ============ */

/** The approval scope (mirrors PaymentAuthorizationScope — verbatim; the material-change intentDigest binding). */
export interface PaymentMissionsApprovalScope {
  readonly missionId: string;
  readonly direction: PaymentMissionsDirection;
  readonly amount: PaymentMissionsAmount;
  readonly destinationSummary: string;
  readonly intentDigest: string;
}

/** The approval request (mirrors PaymentAuthorizationRequestDto): the scoped
 * request over the mission's PERSISTED preview. The channel edge pins the
 * origin (PREVIEW_UI_ACT) and principal host-side — the renderer can never
 * supply, forge or see an origin through this port. */
export interface PaymentMissionsApprovalRequest {
  readonly requestId: string;
  readonly previewId: string;
  readonly missionId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly scope: PaymentMissionsApprovalScope;
  readonly scopeSummary: string;
}

/** The approval resolution (mirrors PaymentAuthorizationResolutionDto): GRANTED
 * (the scope echo + expiry — the single-use artifact NEVER crosses; the
 * observable truth is the mission state + the timeline), DECLINED, or the
 * typed failure. */
export type PaymentMissionsApprovalResolution =
  | { readonly outcome: "GRANTED"; readonly scope: PaymentMissionsApprovalScope; readonly expiresAt: string }
  | { readonly outcome: "DECLINED"; readonly reason: string }
  | { readonly outcome: "FAILED"; readonly failure: string; readonly reason: string };

/* ============ THE PORT (the pinned composition seam the mount consumes) ============ */

/** The payment-missions port (the pinned mirror of the mission-plane channel
 * members, ADR-0011 D1): reads + intake-plane inputs + the two-act approval
 * members. The platform host's composition root binds the REAL channel
 * adapter; the app ships NO default (an unbound port renders the honest
 * not-wired note — never fabricated missions). */
export interface PaymentMissionsPort {
  /** The mission board (the channel returns newest-updated-first). */
  board(): Promise<readonly PaymentMissionsBoardItem[]>;
  /** The full mission detail, or null when no such mission exists. */
  detail(missionId: string): Promise<PaymentMissionsDetail | null>;
  /** The next missing intake field (deterministic order), or null when the intake is complete. */
  askNextField(missionId: string): Promise<{ fieldId: string; question: string } | null>;
  /** Capture one intake field (fail-closed validation host-side) → the updated detail. */
  capture(missionId: string, fieldId: string, value: unknown): Promise<PaymentMissionsDetail>;
  /** Present the structured preview over the honest gate environment, persisted; null when the mission is gone. */
  presentPreview(missionId: string): Promise<PaymentMissionsPreview | null>;
  /** Act 1 of the approval: the scoped request over the mission's persisted preview. */
  requestApproval(missionId: string): Promise<PaymentMissionsApprovalRequest>;
  /** Act 2 of the approval: the operator's decision on the scope card (the origin is pinned at the channel edge). */
  resolveApproval(requestId: string, decision: "APPROVE" | "DECLINE"): Promise<PaymentMissionsApprovalResolution>;
}

/* ============ the typed plane-not-configured discriminator ============ */

/** The app-side catch shape for the channel's typed fail-closed
 * PaymentPlaneNotConfiguredError (the bridge maps the channel rejection onto
 * this class; the mount catches it and renders the honest note — never an
 * error mask, never a silent no-op). */
export class PaymentMissionsPlaneNotConfiguredError extends Error {
  readonly kind = "PLANE_NOT_CONFIGURED" as const;
  constructor(message: string) {
    super(message);
    this.name = "PaymentMissionsPlaneNotConfiguredError";
  }
}

/** True iff the thrown value is the typed plane-not-configured outcome. */
export function isPaymentMissionsPlaneNotConfigured(thrown: unknown): thrown is PaymentMissionsPlaneNotConfiguredError {
  return (
    thrown instanceof PaymentMissionsPlaneNotConfiguredError ||
    (thrown !== null && typeof thrown === "object" &&
      (thrown as { readonly name?: unknown }).name === "PaymentMissionsPlaneNotConfiguredError")
  );
}

/* ============ the view-model vocabulary (the honest states) ============ */

/** The ask flow's phases + state (the intake capture UX state machine). */
export const PAYMENT_MISSIONS_ASK_PHASES = Object.freeze([
  "IDLE", "ASKING", "ASKED", "CAPTURING", "COMPLETE",
] as const);
export type PaymentMissionsAskPhase = (typeof PAYMENT_MISSIONS_ASK_PHASES)[number];

export interface PaymentMissionsAskState {
  readonly phase: PaymentMissionsAskPhase;
  readonly fieldId?: string;
  readonly question?: string;
}

/** The approval flow's phases — THE TWO-ACT LAW is structural: SCOPE_CARD
 * exists only after requestApproval returned (act 1), and RESOLVING /
 * RESOLVED are reachable only from the scope card (act 2). */
export const PAYMENT_MISSIONS_APPROVAL_PHASES = Object.freeze([
  "IDLE", "REQUESTING", "SCOPE_CARD", "RESOLVING", "RESOLVED",
] as const);
export type PaymentMissionsApprovalPhase = (typeof PAYMENT_MISSIONS_APPROVAL_PHASES)[number];

export interface PaymentMissionsApprovalState {
  readonly phase: PaymentMissionsApprovalPhase;
  readonly request?: PaymentMissionsApprovalRequest;
  readonly resolution?: PaymentMissionsApprovalResolution;
}

/** The detail view's interaction state (mount-owned; panel-projected). */
export interface PaymentMissionsDetailState {
  readonly detail: PaymentMissionsDetail;
  readonly ask: PaymentMissionsAskState;
  readonly preview: PaymentMissionsPreview | null;
  readonly presenting: boolean;
  readonly approval: PaymentMissionsApprovalState;
}

/** The panel's view-model kinds (the honest states; frozen order = the render order). */
export const PAYMENT_MISSIONS_VIEW_KINDS = Object.freeze([
  "NOT_WIRED", "PLANE_NOT_CONFIGURED", "LOADING", "LOADING_MISSION",
  "BOARD", "BOARD_EMPTY", "DETAIL", "MISSION_NOT_FOUND", "ERROR",
] as const);
export type PaymentMissionsViewKind = (typeof PAYMENT_MISSIONS_VIEW_KINDS)[number];

/** The panel's view model: every honest state, never an error mask where an empty state is the truth. */
export type PaymentMissionsView =
  | { readonly kind: "NOT_WIRED" }
  | { readonly kind: "PLANE_NOT_CONFIGURED" }
  | { readonly kind: "LOADING" }
  | { readonly kind: "LOADING_MISSION"; readonly missionId: string }
  | { readonly kind: "BOARD"; readonly items: readonly PaymentMissionsBoardItem[] }
  | { readonly kind: "BOARD_EMPTY" }
  | { readonly kind: "MISSION_NOT_FOUND"; readonly missionId: string }
  | { readonly kind: "ERROR"; readonly message: string }
  | { readonly kind: "DETAIL"; readonly state: PaymentMissionsDetailState };

/* ============ the honest states + the pinned honest notes (scan-clean) ============ */

/** The not-wired truth (the web-host default until the composition root binds the port). */
export const PAYMENT_MISSIONS_NOT_WIRED_NOTE =
  "The payment-missions board is not wired in this deployment — no mission can be shown honestly here. The platform host binds the mission-plane channel at its composition root; until then this surface states the gap instead of inventing missions." as const;

/** The typed fail-closed plane outcome, phrased honestly. */
export const PAYMENT_MISSIONS_PLANE_NOT_CONFIGURED_NOTE =
  "The payment-mission plane is not configured in this host — the mission calls fail closed. Nothing is shown because nothing can be read honestly; the host records the gap once on its own seam." as const;

/** The designed-empty contract (ADR-0011 D6 names the store distinction honestly). */
export const PAYMENT_MISSIONS_EMPTY_NOTE =
  "No payment missions yet — missions are seeded from the composer or the entry actions. The console workspace's own missions section keeps a separate demand-side store; this board follows the agent-led payment journey only." as const;

/** The append-only timeline law + the intake law (nothing guessed, defaulted or inferred). */
export const PAYMENT_MISSIONS_TIMELINE_NOTE =
  "The timeline is append-only: every entry below is people language, recorded in order and never rewritten." as const;

export const PAYMENT_MISSIONS_INTAKE_NOTE =
  "Every field is missing until an explicit answer is captured — nothing is guessed, defaulted or inferred here." as const;

/** The complete-intake note. */
export const PAYMENT_MISSIONS_INTAKE_COMPLETE_NOTE =
  "The intake is complete — every required field has an explicit answer. Present the structured preview to see the gates' verdict." as const;

export const PAYMENT_MISSIONS_PRESENT_NOTE =
  "Presenting runs the six gates over this deployment's honest environment and records the presentation on the mission timeline — a typed block is shown with every reason verbatim." as const;

/** The not-dispatchable honesty (a BLOCK is the surfaced outcome, never repaired). */
export const PAYMENT_MISSIONS_NOT_DISPATCHABLE_NOTE =
  "This preview is not dispatchable: it is shown exactly as the gates decided, never repaired or overridden here. An honest block is the surfaced outcome — never a fabricated route." as const;

/** The two-act law in people language (ADR-0011 D2). */
export const PAYMENT_MISSIONS_TWO_ACT_NOTE =
  "Two explicit acts, exactly as the approval law requires: this card shows the exact scope of what you asked to review, and nothing is approved until you confirm it here. Declining records the refusal and changes nothing else." as const;

/** The intent-digest binding, in people language. */
export const PAYMENT_MISSIONS_SCOPE_BINDING_NOTE =
  "This scope is bound to the exact compiled intent the preview was presented against (the digest above): a material change host-side invalidates the request — it can never silently approve a different payment." as const;

/** The armed state after a granted resolution (D3) + the declined outcome. */
export const PAYMENT_MISSIONS_ARMED_NOTE =
  "Approved and armed — the dispatch happens host-side; this surface never fires it. The mission now sits armed until a host-side dispatch consumes the approval; nothing moves from this panel." as const;

export const PAYMENT_MISSIONS_DECLINED_NOTE =
  "Declined — no approval was recorded. The mission stands exactly as it was; only this refusal was added to the timeline." as const;
