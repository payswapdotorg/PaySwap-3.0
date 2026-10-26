/**
 * PaySwap Desktop (P13-C) — the payment-mission plane's typed vocabulary
 * and durable record contracts.
 *
 * THE LANE (ADR-0007 D7, the payment-dispatch authority boundary): this
 * tree implements the guided Pay intake, the authorization gate, the
 * durable mission and the reconciliation driver INSIDE the desktop host.
 * The canonical consequential path is the only one implemented:
 *
 *   intake (conversational, never guessing)
 *     → validation against REAL state (accounts / corridor / quote /
 *       limits / provider scopes / policy — all honestly absent here)
 *     → structured preview (provenance + expiry + destination + risk)
 *     → EXPLICIT scoped user authorization (a UI act on the preview;
 *       text/NLP/voice is NEVER authorization)
 *     → execution through the typed ExecutionAuthorityPort ONLY
 *     → observations with evidence (UNKNOWN reconciles before retry)
 *     → append-only mission timeline + reconciliation
 *
 * LAYER LAW (the desktop host discipline): this tree imports NO @payswap/*
 * package. The shared agent-task vocabulary (@payswap/surface
 * agent-tasks.ts, TL-frozen) and the canonical PaymentIntent shape
 * (@payswap/economic payment-intent.ts) are pinned BY VALUE here and in
 * ./adapters/ — the established two-step mirror discipline; behavioral
 * fidelity against the REAL contracts is asserted by
 * test/payswap/payments-contract-mirrors.test.ts (which imports the real
 * packages from the test tier, where cross-package source imports are
 * lawful). Live-import composition is the TL's integration step.
 *
 * ADVISORY DEMAND ONLY: a payment mission record is a demand-side
 * orchestration artifact. It is NOT authorization (the artifact in
 * authorization-gate.ts is), NOT financial truth, NOT capability state.
 */

// ---------------------------------------------------------------------------
// The shared agent-task vocabulary (pinned BY VALUE from
// packages/surface/src/agent-tasks.ts — drift is a two-step conscious
// change caught by the mirror test)
// ---------------------------------------------------------------------------

/** Mirrors AGENT_TASK_ORIGINS. Voice is declared-unsupported in this deployment. */
export const PAYMENT_TASK_ORIGINS = [
  "SURFACE_ACTION",
  "COMPOSER_TEXT",
  "COMPOSER_VOICE",
  "SYSTEM",
] as const;
export type PaymentTaskOrigin = (typeof PAYMENT_TASK_ORIGINS)[number];

/** Mirrors SUPPORTED_AGENT_TASK_ORIGINS. */
export const SUPPORTED_PAYMENT_TASK_ORIGINS: readonly PaymentTaskOrigin[] = Object.freeze([
  "SURFACE_ACTION",
  "COMPOSER_TEXT",
  "SYSTEM",
]);

/** Mirrors AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT (rendered verbatim, never bypassed). */
export const PAYMENT_TASK_VOICE_UNSUPPORTED_STATEMENT =
  "Voice input is not supported in this deployment — there is no speech-to-text capability to route. Type your request instead; it reaches the same task system.";

/** Mirrors AGENT_TASK_STATUSES (the task lifecycle; terminal = monotonic;
 * WAITING_FOR_OPPORTUNITIES is resumable and NON-terminal, P16-D). */
export const PAYMENT_TASK_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "AWAITING_EXTERNAL_RETURN",
  "PAUSED",
  "WAITING_FOR_OPPORTUNITIES",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type PaymentTaskStatus = (typeof PAYMENT_TASK_STATUSES)[number];

/** Mirrors TERMINAL_AGENT_TASK_STATUSES. */
export const TERMINAL_PAYMENT_TASK_STATUSES: readonly PaymentTaskStatus[] = Object.freeze([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

export function isTerminalPaymentTaskStatus(status: PaymentTaskStatus): boolean {
  return TERMINAL_PAYMENT_TASK_STATUSES.includes(status);
}

/**
 * Mirrors AGENT_TASK_EVENT_KINDS (append-only mission event kinds; the
 * P16-D wait kinds are APPENDED after EXPIRED) PLUS the payment plane's
 * own PLAN_SELECTION_RECORDED (P17-A, ADR-0010 D3), appended after the
 * shared 21 — the payment-mission event vocabulary is a strict superset
 * of the shared agent-task one (22 kinds), and the mirror test pins
 * both sides of that split.
 */
export const PAYMENT_TASK_EVENT_KINDS = [
  "CREATED", "RESUMED", "FIELD_CAPTURED", "MISSING_FIELD_ASKED", "VALIDATED",
  "PREVIEW_PRESENTED", "AUTHORIZATION_GRANTED", "AUTHORIZATION_DECLINED",
  "EXTERNAL_RETURN_VALIDATED", "EXTERNAL_RETURN_REJECTED", "ATTEMPT_STARTED",
  "ATTEMPT_CONFIRMED", "ATTEMPT_FAILED", "OUTCOME_UNKNOWN", "RECONCILED",
  "CANCELLED", "EXPIRED",
  // The P16-D wait kinds (appended after EXPIRED — the shared vocabulary's own append).
  "WAIT_STARTED", "WAIT_CRITERIA_RECORDED", "OPPORTUNITY_MATCHED", "WAIT_EXPIRED",
  // The payment plane's own kind (P17-A, ADR-0010 D3 — the stage-9a landing site).
  "PLAN_SELECTION_RECORDED",
] as const;
export type PaymentTaskEventKind = (typeof PAYMENT_TASK_EVENT_KINDS)[number];

/**
 * Mirrors AGENT_TASK_WAIT_VOCABULARY (P16-D, ADR-0009 D8): a wait match
 * records OPPORTUNITY_MATCHED and the task STAYS WAITING (only cancel/
 * expire/fresh-approval move it); the app NEVER writes AUTHORIZATION_GRANTED
 * for a wait match — that event belongs to the real authority surface.
 * matchAutoDispatches is the LITERAL false, never a derived value.
 */
export const PAYMENT_TASK_WAIT_VOCABULARY = Object.freeze({
  status: "WAITING_FOR_OPPORTUNITIES",
  eventKinds: Object.freeze([
    "WAIT_STARTED",
    "WAIT_CRITERIA_RECORDED",
    "OPPORTUNITY_MATCHED",
    "WAIT_EXPIRED",
  ] as const),
  matchAutoDispatches: false,
} as const);

/** Mirrors MissionIntentDirection (console-missions vocabulary). */
export const PAYMENT_MISSION_DIRECTIONS = ["PAY", "RECEIVE", "MOVE", "CONVERT"] as const;
export type PaymentMissionDirection = (typeof PAYMENT_MISSION_DIRECTIONS)[number];

/** One append-only mission event (mirrors the AgentTaskEvent shape). */
export interface PaymentMissionEvent {
  readonly id: string;
  /** ISO-8601 UTC instant — explicit input, never ambient. */
  readonly at: string;
  readonly kind: PaymentTaskEventKind;
  /** People-language summary (no secret material ever — the chat law). */
  readonly summary: string;
  /** Correlation reference (idempotency key, artifact id, evidence ref…). */
  readonly correlationRef?: string;
}

// ---------------------------------------------------------------------------
// The nine required intake fields (work-order law: gathered
// conversationally WITHOUT guessing — every field is MISSING until an
// EXPLICIT capture; "no preference" is an explicit captured value, never
// a default)
// ---------------------------------------------------------------------------

export const PAYMENT_INTAKE_FIELD_IDS = [
  "amountAndCurrency",
  "fundingSource",
  "recipient",
  "countryCorridor",
  "speedDeadline",
  "feeCap",
  "purpose",
  "privacyCompliance",
  "partialPaymentPreference",
] as const;
export type PaymentIntakeFieldId = (typeof PAYMENT_INTAKE_FIELD_IDS)[number];

/** The exact-money wire shape (pinned AmountSpec — integer minor units). */
export interface PaymentAmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}

/** What one capture carries, per field (all explicit; none defaulted). */
export interface PaymentIntakeCaptures {
  /** Exact amount + currency leaving the funding source (positive). */
  amountAndCurrency: PaymentAmountSpec;
  /** User-stated funding-source preference (NOT an observed account). */
  fundingSource: string;
  /** Recipient reference as stated (NOT a verified payee). */
  recipient: string;
  /** Corridor: source country, destination country, destination currency. */
  countryCorridor: {
    readonly sourceCountry: string;
    readonly destinationCountry: string;
    readonly destinationCurrency: string;
  };
  /** Delivery deadline (ISO-8601 UTC; strictly after the mission creation). */
  speedDeadline: { readonly deadlineAt: string };
  /** Fee cap — an explicit cap, or an explicit no-cap statement. */
  feeCap: { readonly kind: "CAPPED"; readonly amount: PaymentAmountSpec } | { readonly kind: "UNCAPPED" };
  /** Purpose of payment, as stated. */
  purpose: string;
  /** Privacy/compliance constraints — explicit constraints, or an explicit none-stated. */
  privacyCompliance:
    | { readonly kind: "CONSTRAINED"; readonly notes: string }
    | { readonly kind: "NONE_STATED" };
  /** Supported partial-payment preference — explicit either way. */
  partialPaymentPreference: { readonly kind: "REQUIRE_FULL" } | { readonly kind: "ALLOW_PARTIAL" };
}

/** Field capture state: MISSING until an explicit capture exists. */
export type PaymentIntakeFieldState<T> = { readonly status: "MISSING" } | { readonly status: "CAPTURED"; readonly value: T };

export type PaymentIntakeFieldStates = {
  readonly [F in PaymentIntakeFieldId]: PaymentIntakeFieldState<PaymentIntakeCaptures[F]>;
};

// ---------------------------------------------------------------------------
// Attempts (execution records with idempotency + correlation references)
// ---------------------------------------------------------------------------

/** The three-value external-effect outcome (pinned INV-04 vocabulary). */
export const PAYMENT_EFFECT_OUTCOMES = ["CONFIRMED", "UNKNOWN", "FAILED"] as const;
export type PaymentEffectOutcome = (typeof PAYMENT_EFFECT_OUTCOMES)[number];

/** The pinned ambiguity reasons (UNKNOWN is never bare). */
export const PAYMENT_AMBIGUITY_REASONS = [
  "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
  "TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH",
  "MALFORMED_RESPONSE_AFTER_DISPATCH",
] as const;
export type PaymentAmbiguityReason = (typeof PAYMENT_AMBIGUITY_REASONS)[number];

/** The execution modes (pinned INV-25 SANDBOX/LIVE law). */
export const PAYMENT_EXECUTION_MODES = ["SANDBOX", "LIVE"] as const;
export type PaymentExecutionMode = (typeof PAYMENT_EXECUTION_MODES)[number];

/**
 * Provider failure metadata (pinned shape — mirrors the real
 * ProviderFailureMetadata including the REQUIRED outcome-ambiguity
 * classification: 'NONE' = definitive failure; 'OUTCOME_UNKNOWN' feeds
 * ambiguity handling and can NEVER ride a FAILED envelope (INV-04)).
 */
export interface PaymentProviderFailure {
  readonly providerErrorCode?: string;
  readonly providerErrorMessage?: string;
  readonly retryable: boolean;
  readonly ambiguity: "NONE" | "OUTCOME_UNKNOWN";
}

/**
 * The pinned execution result envelope — field-for-field the REAL
 * @payswap/provider-runtime ExecutionResultEnvelope (mirror-asserted by
 * test/payswap/payments-contract-mirrors.test.ts): dispatched/completed
 * are TimestampMs INTEGERS, the raw-state pointer is retained losslessly,
 * and there is NO executionMode field here — the execution mode is a
 * property of the ATTEMPT (INV-25 brands every attempt record), never of
 * the authority's answer. UNKNOWN ≠ FAILED (INV-04).
 */
export interface PaymentResultEnvelope {
  readonly outcome: PaymentEffectOutcome;
  readonly providerReferences: readonly string[];
  readonly providerFailure?: PaymentProviderFailure;
  /** Present for UNKNOWN — the recorded ambiguity reason. */
  readonly ambiguityReason?: PaymentAmbiguityReason;
  /** Retained raw provider-state record (lossless retention upstream). */
  readonly rawStateRecordId?: string;
  readonly dispatchedAt: number;
  readonly completedAt: number;
}

/** One consequential attempt on a mission (append-only fields after start). */
export interface PaymentAttemptRecord {
  readonly attemptId: string;
  readonly operation: "CREATE_EXTERNAL_EFFECT" | "CANCEL_OR_REVERSE_EFFECT";
  /** Durable idempotency key (deterministic per mission+operation+intent digest). */
  readonly idempotencyKey: string;
  readonly commandId: string;
  readonly correlationId: string;
  /** The executing connected instance (opaque; the registry owns meaning). */
  readonly connectionRef: string;
  /** INV-25: every attempt record is branded with its execution mode. */
  readonly executionMode: PaymentExecutionMode;
  readonly authorizationArtifactId: string;
  readonly startedAt: string;
  /** Present once the authority answered; the envelope is never mutated. */
  readonly envelope?: PaymentResultEnvelope;
  /**
   * Present when the authority REFUSED the command before any effect (a
   * typed refusal is definitively not a provider answer — no envelope is
   * fabricated for it, and the attempt is resolved-no-effect).
   */
  readonly refusal?: {
    readonly kind: "NO_AUTHORITY_WIRED" | "CONNECTION_NOT_ACTIVE" | "MODE_NOT_OFFERED" | "AUTHORIZATION_INVALID" | "COMMAND_REJECTED";
    readonly reason: string;
  };
  /** Present once reconciliation evidence closed an UNKNOWN. */
  readonly reconciliation?: {
    readonly resolvedTo: "CONFIRMED" | "FAILED";
    readonly source: "EXTERNAL_PROVIDER_STATEMENT" | "EXTERNAL_PROVIDER_RETRIEVAL";
    readonly evidenceRefs: readonly string[];
    readonly resolvedAt: string;
  };
}

// ---------------------------------------------------------------------------
// The stage-9a plan-selection record (P17-A, ADR-0010 D3)
// ---------------------------------------------------------------------------

/**
 * The mission's latest selected route-planning plan (P17-A, ADR-0010
 * D3 — the stage-9a landing site). IT IS A RECORD, NEVER AN
 * AUTHORIZATION: the composer still NEVER writes AUTHORIZATION_GRANTED
 * (ADR-0009 D8), the scoped approval artifact is still minted LATER,
 * against the presented preview (the origin law in
 * authorization-gate.ts — only a PREVIEW_UI_ACT approves), and the
 * dispatch command is unchanged. This record only names the plan the
 * demand-side mission intends to pursue; the events stay append-only
 * while the field carries the LATEST selection (re-selection replaces
 * the field, never the history). Fields: the plan id (opaque; the
 * intelligence layer owns its format), the digest of the exact route
 * view the selection was made against (tamper-evident lineage), the
 * producing routine, its pinned version, and the selection instant.
 */
export interface PaymentMissionPlanSelection {
  readonly planId: string;
  readonly viewDigest: string;
  readonly routineId: string;
  readonly routineVersion: string;
  readonly selectedAt: string;
}

/**
 * The honest field maxima for a plan selection (bounded strings, never
 * trimmed — an over-limit value is a typed refusal, not a haircut),
 * derived from the REAL authority formats (see the field docs above).
 */
export const PAYMENT_PLAN_SELECTION_LIMITS = Object.freeze({
  planId: 160,
  viewDigest: 64,
  routineId: 96,
  routineVersion: 32,
} as const);

/** The pinned, bounded input a plan selection is recorded from (the service stamps selectedAt). */
export interface PaymentMissionPlanSelectionInput {
  readonly planId: string;
  readonly viewDigest: string;
  readonly routineId: string;
  readonly routineVersion: string;
}

// ---------------------------------------------------------------------------
// The durable mission record
// ---------------------------------------------------------------------------

/** The mission record persisted under the workspace-store discipline. */
export interface PaymentMissionRecord {
  /**
   * Durable task id (ADR-0007 D6): host-minted
   * `task:PAYMENT_MISSION:<crypto-random>`, persisted with the record —
   * stable across restarts, never reused (crypto-random, not a counter).
   */
  readonly id: string;
  readonly direction: PaymentMissionDirection;
  readonly goalStatement: string;
  readonly origin: PaymentTaskOrigin;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: PaymentTaskStatus;
  /** The status the mission returns to on resume (never a terminal). */
  readonly resumeFrom: PaymentTaskStatus;
  /** Append-only history, newest-first (the writer appends, never rewrites). */
  readonly events: readonly PaymentMissionEvent[];
  /** The nine-field intake state. */
  readonly fields: PaymentIntakeFieldStates;
  /** The compiled ADVISORY demand record (11-field canonical), once compilable. */
  readonly intent?: CompiledPaymentIntent;
  /** The presented preview id, once a preview passed the gate chain. */
  readonly previewId?: string;
  /**
   * The latest stage-9a plan selection (P17-A, ADR-0010 D3) — a RECORD,
   * never an authorization (see PaymentMissionPlanSelection).
   */
  readonly planSelection?: PaymentMissionPlanSelection;
  /** The consumed authorization artifact id, once dispatch was armed. */
  readonly authorizationArtifactId?: string;
  /** Consequential attempts (execution + compensation), in start order. */
  readonly attempts: readonly PaymentAttemptRecord[];
}

// ---------------------------------------------------------------------------
// The compiled ADVISORY demand record — the 11-field canonical
// PaymentIntent pin (see ./adapters/economic-payment-intent.ts)
// ---------------------------------------------------------------------------

import type {
  CanonicalPaymentIntent,
  CanonicalFundsLocationRef,
} from "./adapters/economic-payment-intent.js";

/** The compiled intent (the canonical 11-field shape, advisory only). */
export type CompiledPaymentIntent = CanonicalPaymentIntent;
export type { CanonicalFundsLocationRef };

// ---------------------------------------------------------------------------
// Typed errors (fail-closed; never stringly-typed control flow) — the
// family lives in ./payment-mission-errors.ts (the ≤400-line file law
// split) and is re-exported here so the contracts module stays the
// payments tree's single import surface.
// ---------------------------------------------------------------------------

export { PaymentMissionError } from "./payment-mission-errors.js";
export type { PaymentMissionErrorKind } from "./payment-mission-errors.js";
