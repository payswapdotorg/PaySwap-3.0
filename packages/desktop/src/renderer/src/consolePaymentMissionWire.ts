/**
 * @zcode/desktop — the payswap-desktop payment-mission WIRE types,
 * structurally re-declared for the renderer (split from
 * ./consoleWorkspaceMount.tsx at P18-A for the ≤400-line file law).
 *
 * The host DTOs live in src/host/payswap (not renderer-importable), so
 * this mirror carries the pinned shapes BY VALUE — the established
 * two-sided drift discipline (test/payswap/desktop-console-client.test
 * .ts asserts the MEMBER sets cannot drift; the shapes are pinned by
 * structural mirroring, the RoutePlanningPanel precedent).
 *
 * THE WIRE LAWS (P17-A ADR-0010 D2; P18-A ADR-0011 D2/D3; P19-A
 * ADR-0012 D1/D2):
 * - read/input verbs only on the member surface; the approval act
 *   crosses as TWO edge-pinned members whose origin + principal are
 *   pinned HOST-SIDE (the renderer supplies ONLY requestId + APPROVE
 *   | DECLINE — it can never supply, forge or see an origin);
 * - NO authorization artifact, NO artifactId and NO consumed-artifact
 *   lineage (idempotency keys, command/correlation ids) exists on any
 *   wire shape here: the detail carries the attempt STATES (outcome
 *   facts only) and a COUNT — the attempt records stay host-side;
 * - the dispatch act crosses as TWO members (P19-A, ADR-0012 D1 — the
 *   lawful narrowing of the ADR-0011 D3 boundary): the armed-effect
 *   READ + the lane-choice ACT. The wire carries a CHOICE, never a
 *   grant — the eligible lane set recomputes HOST-SIDE at act time,
 *   and the artifact, the operation and the INV-25 mode resolve
 *   HOST-SIDE (the artifact never crosses, not even as an input; the
 *   outcome carries facts only: kind, attemptId, summary). The lanes
 *   carry the registry's own ids + people-language labels ONLY — no
 *   credentials, no credential handles, no secrets.
 */

// ---------------------------------------------------------------------------
// The P17-A mission wire types (the pinned host DTO shapes, mirrored)
// ---------------------------------------------------------------------------

/** The mission direction vocabulary (mirrors the host pin). */
export type PaySwapPaymentMissionDirection = "PAY" | "RECEIVE" | "MOVE" | "CONVERT";

/** The mission status vocabulary (mirrors the host pin). */
export type PaySwapPaymentMissionStatus =
  | "DRAFT"
  | "ACTIVE"
  | "AWAITING_EXTERNAL_RETURN"
  | "PAUSED"
  | "WAITING_FOR_OPPORTUNITIES"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

/** The append-only event-kind vocabulary (mirrors the host pin: the shared 21 + PLAN_SELECTION_RECORDED). */
export type PaySwapPaymentMissionEventKind =
  | "CREATED" | "RESUMED" | "FIELD_CAPTURED" | "MISSING_FIELD_ASKED" | "VALIDATED"
  | "PREVIEW_PRESENTED" | "AUTHORIZATION_GRANTED" | "AUTHORIZATION_DECLINED"
  | "EXTERNAL_RETURN_VALIDATED" | "EXTERNAL_RETURN_REJECTED" | "ATTEMPT_STARTED"
  | "ATTEMPT_CONFIRMED" | "ATTEMPT_FAILED" | "OUTCOME_UNKNOWN" | "RECONCILED"
  | "CANCELLED" | "EXPIRED" | "WAIT_STARTED" | "WAIT_CRITERIA_RECORDED"
  | "OPPORTUNITY_MATCHED" | "WAIT_EXPIRED" | "PLAN_SELECTION_RECORDED";

/** The exact-money wire shape (integer minor units). */
export interface PaySwapPaymentAmountDto {
  readonly currency: string;
  readonly minorUnits: string;
}

/** One timeline event on the wire (append-only; people-language summary). */
export interface PaySwapPaymentMissionEventDto {
  readonly id: string;
  readonly at: string;
  readonly kind: PaySwapPaymentMissionEventKind;
  readonly summary: string;
  readonly correlationRef?: string;
}

/** The stage-9a plan selection — a RECORD, never an authorization (ADR-0010 D3). */
export interface PaySwapPaymentMissionPlanSelectionDto {
  readonly planId: string;
  readonly viewDigest: string;
  readonly routineId: string;
  readonly routineVersion: string;
  readonly selectedAt: string;
}

/** The compiled 11-key canonical intent (advisory demand record only). */
export interface PaySwapPaymentIntentDto {
  readonly intentId: string;
  readonly principalRef: string;
  readonly origin: { readonly locationRef: string; readonly currency: string; readonly observationRef: string };
  readonly destination: { readonly locationRef: string; readonly currency: string; readonly observationRef: string };
  readonly originAmount: PaySwapPaymentAmountDto;
  readonly arrivalCurrency: string;
  readonly constraints: { readonly maxSettlementMs: number; readonly maxRouteHops: number };
  readonly intentAuthorizationRef: string;
  readonly declaredAt: number;
  readonly expiresAt: number;
  readonly commerceRef: string;
}

/** Field capture state: MISSING until an explicit capture exists. */
export type PaySwapPaymentIntakeFieldState<T> =
  | { readonly status: "MISSING" }
  | { readonly status: "CAPTURED"; readonly value: T };

/** The nine-field intake state (every field explicit; none defaulted). */
export interface PaySwapPaymentIntakeFieldsDto {
  readonly amountAndCurrency: PaySwapPaymentIntakeFieldState<PaySwapPaymentAmountDto>;
  readonly fundingSource: PaySwapPaymentIntakeFieldState<string>;
  readonly recipient: PaySwapPaymentIntakeFieldState<string>;
  readonly countryCorridor: PaySwapPaymentIntakeFieldState<{
    readonly sourceCountry: string;
    readonly destinationCountry: string;
    readonly destinationCurrency: string;
  }>;
  readonly speedDeadline: PaySwapPaymentIntakeFieldState<{ readonly deadlineAt: string }>;
  readonly feeCap: PaySwapPaymentIntakeFieldState<
    | { readonly kind: "CAPPED"; readonly amount: PaySwapPaymentAmountDto }
    | { readonly kind: "UNCAPPED" }
  >;
  readonly purpose: PaySwapPaymentIntakeFieldState<string>;
  readonly privacyCompliance: PaySwapPaymentIntakeFieldState<
    | { readonly kind: "CONSTRAINED"; readonly notes: string }
    | { readonly kind: "NONE_STATED" }
  >;
  readonly partialPaymentPreference: PaySwapPaymentIntakeFieldState<
    | { readonly kind: "REQUIRE_FULL" }
    | { readonly kind: "ALLOW_PARTIAL" }
  >;
}

/** One board row (the payments read model — demand-side facts only). */
export interface PaySwapPaymentMissionBoardItemDto {
  readonly missionId: string;
  readonly direction: PaySwapPaymentMissionDirection;
  readonly goalStatement: string;
  readonly status: PaySwapPaymentMissionStatus;
  readonly hasCompiledIntent: boolean;
  readonly hasPreview: boolean;
  readonly planSelection?: PaySwapPaymentMissionPlanSelectionDto;
  readonly updatedAt: string;
}

/** The gate aggregate on the wire (reasons carried VERBATIM). */
export interface PaySwapPaymentPreviewGatesDto {
  readonly decision: "BLOCK" | "PROCEED";
  readonly decisions: readonly {
    readonly gate: string;
    readonly decision: "BLOCK" | "PROCEED";
    readonly reason: string;
  }[];
  readonly reasons: readonly string[];
}

/** The presented preview on the wire (the typed BLOCK is surfaced honestly, never fabricated away). */
export interface PaySwapPaymentPreviewDto {
  readonly previewId: string;
  readonly missionId: string;
  readonly gates: PaySwapPaymentPreviewGatesDto;
  readonly dispatchable: boolean;
  readonly presentedAt: string;
  readonly planSelection?: PaySwapPaymentMissionPlanSelectionDto;
}

/** The channel seed input (the host pins the origin to COMPOSER_TEXT). */
export interface PaySwapPaymentMissionSeedInputDto {
  readonly direction: PaySwapPaymentMissionDirection;
  readonly goalStatement: string;
}

/** The stage-9a plan-selection input (the host stamps selectedAt). */
export interface PaySwapPaymentPlanSelectionInputDto {
  readonly planId: string;
  readonly viewDigest: string;
  readonly routineId: string;
  readonly routineVersion: string;
}

// ---------------------------------------------------------------------------
// The P18-A approval wire types (ADR-0011 D2 — nothing from the artifact
// plane; the origin + principal are pinned host-side at the channel edge)
// ---------------------------------------------------------------------------

/** The authorization scope on the wire (the exact terms an approval covers). */
export interface PaySwapPaymentAuthorizationScopeDto {
  readonly missionId: string;
  readonly direction: PaySwapPaymentMissionDirection;
  readonly amount: PaySwapPaymentAmountDto;
  readonly destinationSummary: string;
  readonly intentDigest: string;
}

/**
 * A pending authorization request on the wire (ADR-0011 D2): the scoped
 * request over the mission's persisted preview — scope verbatim,
 * scopeSummary + expiry for the operator's decision. NO artifact fields.
 */
export interface PaySwapPaymentAuthorizationRequestDto {
  readonly requestId: string;
  readonly previewId: string;
  readonly missionId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly scope: PaySwapPaymentAuthorizationScopeDto;
  readonly scopeSummary: string;
}

/**
 * The typed resolution outcome on the wire (ADR-0011 D2): GRANTED echoes
 * the approved scope + expiry (NEVER an artifactId); DECLINED carries the
 * people-language reason; REJECTED mirrors the runtime's non-UI-origin
 * rejection — unreachable through the channel member, which pins the
 * origin PREVIEW_UI_ACT host-side. Typed failures beyond these outcomes
 * are thrown (the host's typed PaymentMissionError family).
 */
export type PaySwapPaymentAuthorizationResolutionDto = {
  readonly outcome:
    | { readonly kind: "GRANTED"; readonly scope: PaySwapPaymentAuthorizationScopeDto; readonly expiresAt: string }
    | { readonly kind: "DECLINED"; readonly reason: string }
    | { readonly kind: "REJECTED"; readonly reason: string };
  readonly missionId: string;
  readonly previewId: string;
};

// ---------------------------------------------------------------------------
// The P18-A attempt-state projection (ADR-0011 D3 — outcome facts only)
// ---------------------------------------------------------------------------

/** The attempt outcome vocabulary (derived host-side; outcome facts only). */
export type PaySwapPaymentAttemptOutcome =
  | "STARTED"
  | "CONFIRMED"
  | "FAILED"
  | "OUTCOME_UNKNOWN"
  | "RECONCILED"
  | "REFUSED";

/**
 * One consequential attempt's STATE on the wire (ADR-0011 D3): outcome
 * facts only — NO idempotency keys, NO command/correlation ids, NO
 * connection refs, NO authorization artifact ids (the consumed-artifact
 * lineage stays host-side).
 */
export interface PaySwapPaymentMissionAttemptStateDto {
  readonly attemptId: string;
  readonly startedAt: string;
  readonly operation: "CREATE_EXTERNAL_EFFECT" | "CANCEL_OR_REVERSE_EFFECT";
  readonly executionMode: "SANDBOX" | "LIVE";
  readonly outcome: PaySwapPaymentAttemptOutcome;
  readonly summary: string;
}

/**
 * The full mission detail on the wire: the timeline, the intake fields,
 * the compiled intent, the preview id, the plan selection, the attempt
 * STATES (outcome facts only) and the attempt COUNT — the attempt
 * records and every artifact-plane field stay host-side.
 */
export interface PaySwapPaymentMissionDetailDto {
  readonly id: string;
  readonly direction: PaySwapPaymentMissionDirection;
  readonly goalStatement: string;
  readonly origin: string;
  readonly status: PaySwapPaymentMissionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly events: readonly PaySwapPaymentMissionEventDto[];
  readonly fields: PaySwapPaymentIntakeFieldsDto;
  readonly intent?: PaySwapPaymentIntentDto;
  readonly previewId?: string;
  readonly planSelection?: PaySwapPaymentMissionPlanSelectionDto;
  readonly attempts: readonly PaySwapPaymentMissionAttemptStateDto[];
  readonly attemptCount: number;
}

// ---------------------------------------------------------------------------
// The P19-A dispatch wire types (ADR-0012 D1/D2 — the lane choice, never
// a grant; the artifact never crosses, not even as an input)
// ---------------------------------------------------------------------------

/**
 * One executing lane on the wire (ADR-0012 D2): the registry's own ids
 * + a people-language label. An ineligible lane carries its reason (LIVE
 * per INV-25, or the non-ACTIVE state); NO credentials, NO credential
 * handles and NO secrets ever appear on this shape.
 */
export interface PaySwapPaymentDispatchLaneDto {
  /** The operator's choice key (the registry's connection id). */
  readonly connectionRef: string;
  /** People language (the registry's own display names — never guessed). */
  readonly label: string;
  readonly providerId: string;
  /** Present exactly when the lane is not dispatchable, with its reason. */
  readonly ineligible?: { readonly reason: string };
}

/**
 * The armed card (ADR-0012 D1 — the READ): the armed truth, the approved
 * scope + expiry echo when armed, the verbatim people-language
 * not-armed reason when not (no artifact exists / expired at <instant> /
 * was consumed at <instant> — each naming the path back), and the
 * resolved executing lanes. NO artifactId exists on this shape.
 */
export interface PaySwapPaymentMissionArmedEffectDto {
  readonly armed: boolean;
  /** The verbatim not-armed reason (present iff armed is false). */
  readonly reason?: string;
  /** The approved scope echo (present iff armed is true). */
  readonly scope?: PaySwapPaymentAuthorizationScopeDto;
  /** The artifact's expiry instant (present iff armed is true). */
  readonly expiresAt?: string;
  /** The resolved executing lanes (eligible + ineligible-with-reason). */
  readonly lanes: readonly PaySwapPaymentDispatchLaneDto[];
}

/**
 * The typed dispatch outcome on the wire (ADR-0012 D1): outcome facts
 * only — the kind, the attempt id and a people-language summary. NO
 * artifactId, NO connectionRef echo, NO envelope internals beyond the
 * summary. REPLAYED mirrors the runtime's idempotent-replay kind
 * (unreachable through this member in practice — a confirmed
 * create-effect completes the mission; the kind exists so the wire type
 * mirrors the runtime's outcome union without lying about the channel's
 * reach). Failures beyond these outcomes are thrown typed.
 */
export type PaySwapPaymentDispatchOutcomeDto =
  | { readonly kind: "DISPATCHED"; readonly attemptId: string; readonly summary: string }
  | { readonly kind: "REPLAYED"; readonly attemptId: string; readonly summary: string }
  | { readonly kind: "REFUSED"; readonly attemptId: string; readonly summary: string };
