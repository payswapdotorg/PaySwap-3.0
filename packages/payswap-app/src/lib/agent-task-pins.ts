/**
 * @payswap/app — STRUCTURAL PINS of the shared agent-task contract
 * (packages/surface/src/agent-tasks.ts, P13-0 / ADR-0007 D6+D9).
 *
 * MIRROR DISCIPLINE (the established src/pins pattern — see
 * surface-pins.ts): @payswap/app is consumed by the ZCode-substrate
 * platform mounts (packages/web, packages/desktop), which depend on
 * @zcode/* workspace packages only and never import @payswap/* — so the
 * shared agent-task contract is pinned STRUCTURALLY here (same
 * literals, same unions, same folds), and the mirror is verified against
 * the REAL source by test/payswap/agent-task-pin-mirror.test.ts (which
 * imports packages/surface/src directly, test-only — the src/**
 * boundary stays clean). The TL wires the real imports at accept-time
 * integration (P13-D); the pinned seed fold ALSO accepts an injected
 * override so the desktop host binding can supply the shared fold.
 *
 * Pins in this file (source modules named per pin):
 * - task vocabulary + envelopes ...... packages/surface/src/agent-tasks.ts
 * - the seed-decision fold ........... packages/surface/src/agent-task-validation.ts
 *   (resolveAgentTaskSeed — mirrored here as resolvePinnedAgentTaskSeed)
 *
 * LAWS carried from the source (ADR-0007 D6/D7):
 * - ADVISORY ONLY: an AgentTask is a demand-side orchestration record —
 *   never authorization, never financial truth, never capability state.
 * - CONVERGENCE: entrypoints with the same resume key seed-or-RESUME the
 *   same task inside the resume window; a resumable task is resumed,
 *   never duplicated.
 * - HONEST ORIGINS: COMPOSER_VOICE is declared-unsupported; the composer
 *   renders the statement verbatim and never simulates voice capture.
 * - MONOTONIC TERMINAL statuses.
 * - THE WAIT LAW (P16-D, ADR-0009 D8): a wait match records
 *   OPPORTUNITY_MATCHED and the task STAYS WAITING; only cancel/expire/
 *   fresh-approval move it; the app NEVER writes AUTHORIZATION_GRANTED for
 *   a wait match — that event belongs to the real authority surface.
 */

import type { MissionIntentDirection } from "../console/contracts.js";

/* ====================================================================
 * Vocabulary (closed, versioned — pinned BY VALUE from the source)
 * ==================================================================== */

/** Mirrors surface AGENT_TASK_KINDS (same literals, same order). */
export const AGENT_TASK_KINDS_PIN = [
  "CONNECTION_SETUP",
  "PAYMENT_MISSION",
] as const;
export type AgentTaskKindPin = (typeof AGENT_TASK_KINDS_PIN)[number];

/** Mirrors surface AGENT_TASK_ORIGINS (COMPOSER_VOICE declared-unsupported). */
export const AGENT_TASK_ORIGINS_PIN = [
  "SURFACE_ACTION",
  "COMPOSER_TEXT",
  "COMPOSER_VOICE",
  "SYSTEM",
] as const;
export type AgentTaskOriginPin = (typeof AGENT_TASK_ORIGINS_PIN)[number];

/** Mirrors surface SUPPORTED_AGENT_TASK_ORIGINS. */
export const SUPPORTED_AGENT_TASK_ORIGINS_PIN: readonly AgentTaskOriginPin[] =
  Object.freeze(["SURFACE_ACTION", "COMPOSER_TEXT", "SYSTEM"]);

/**
 * Mirrors surface AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT VERBATIM — the
 * honest unsupported-voice statement. Rendered verbatim by the composer,
 * never bypassed, never paraphrased (drift is caught by the mirror test).
 */
export const AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT_PIN =
  "Voice input is not supported in this deployment — there is no speech-to-text capability to route. Type your request instead; it reaches the same task system." as const;

/** Mirrors surface AGENT_TASK_STATUSES (terminal statuses are monotonic;
 * WAITING_FOR_OPPORTUNITIES is resumable and NON-terminal, P16-D). */
export const AGENT_TASK_STATUSES_PIN = [
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
export type AgentTaskStatusPin = (typeof AGENT_TASK_STATUSES_PIN)[number];

/** Mirrors surface TERMINAL_AGENT_TASK_STATUSES. */
export const TERMINAL_AGENT_TASK_STATUSES_PIN: readonly AgentTaskStatusPin[] =
  Object.freeze(["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"]);

export function isTerminalAgentTaskStatusPin(status: AgentTaskStatusPin): boolean {
  return TERMINAL_AGENT_TASK_STATUSES_PIN.includes(status);
}

/** A task is resumable iff its status is non-terminal. */
export function isResumableAgentTaskStatusPin(status: AgentTaskStatusPin): boolean {
  return !isTerminalAgentTaskStatusPin(status);
}

/** Mirrors surface AGENT_TASK_EVENT_KINDS (append-only event vocabulary;
 * the P16-D wait kinds are APPENDED after EXPIRED). */
export const AGENT_TASK_EVENT_KINDS_PIN = [
  "CREATED",
  "RESUMED",
  "FIELD_CAPTURED",
  "MISSING_FIELD_ASKED",
  "VALIDATED",
  "PREVIEW_PRESENTED",
  "AUTHORIZATION_GRANTED",
  "AUTHORIZATION_DECLINED",
  "EXTERNAL_RETURN_VALIDATED",
  "EXTERNAL_RETURN_REJECTED",
  "ATTEMPT_STARTED",
  "ATTEMPT_CONFIRMED",
  "ATTEMPT_FAILED",
  "OUTCOME_UNKNOWN",
  "RECONCILED",
  "CANCELLED",
  "EXPIRED",
  "WAIT_STARTED",
  "WAIT_CRITERIA_RECORDED",
  "OPPORTUNITY_MATCHED",
  "WAIT_EXPIRED",
  // P21-B (ADR-0014 D3): stage 0's pin event — routineId + version + skill
  // digest land in the app task store when the routine loads (appended
  // after WAIT_EXPIRED, never inserted mid-list — the append-only spirit).
  "ROUTINE_PINNED",
] as const;
export type AgentTaskEventKindPin = (typeof AGENT_TASK_EVENT_KINDS_PIN)[number];

/**
 * Mirrors surface AGENT_TASK_WAIT_VOCABULARY (P16-D, ADR-0009 D8): a wait
 * match records OPPORTUNITY_MATCHED and the task STAYS WAITING (only
 * cancel/expire/fresh-approval move it); the app NEVER writes
 * AUTHORIZATION_GRANTED for a wait match — that event belongs to the real
 * authority surface. matchAutoDispatches is the LITERAL false, never a
 * derived value; drift is caught by the mirror test byte-for-byte.
 */
export const AGENT_TASK_WAIT_VOCABULARY_PIN = Object.freeze({
  status: "WAITING_FOR_OPPORTUNITIES",
  eventKinds: Object.freeze([
    "WAIT_STARTED",
    "WAIT_CRITERIA_RECORDED",
    "OPPORTUNITY_MATCHED",
    "WAIT_EXPIRED",
  ] as const),
  matchAutoDispatches: false,
} as const);

/**
 * Mirrors surface AGENT_TASK_CONNECTION_FORMS — the connection-form
 * literals pinned BY VALUE from @payswap/provider-runtime (the boundary
 * law; the app pins the surface's pin, one conscious step from the rail
 * vocabulary — verified transitively by the mirror test).
 */
export const AGENT_TASK_CONNECTION_FORMS_PIN = [
  "DELEGATED_OAUTH",
  "CONNECTED_ACCOUNT",
  "SCOPED_API_CREDENTIAL",
  "ISOLATED_INTERACTIVE_BROWSER_SESSION",
  "PROVIDERLESS_RAIL",
] as const;
export type AgentTaskConnectionFormPin = (typeof AGENT_TASK_CONNECTION_FORMS_PIN)[number];

/* ====================================================================
 * The typed intents (one per task kind — mirrors the source shapes)
 * ==================================================================== */

/** Mirrors surface ConnectionSetupIntent. */
export interface ConnectionSetupIntentPin {
  readonly kind: "CONNECTION_SETUP";
  /** Registry provider id (e.g. "stripe"). Opaque here — the registry owns meaning. */
  readonly providerId: string;
  readonly form: AgentTaskConnectionFormPin;
  /** The registry-declared use case being set up (e.g. "own-store-test-mode"). */
  readonly useCaseRef?: string;
}

/** Mirrors surface PaymentMissionIntent (direction composes the mission vocabulary). */
export interface PaymentMissionIntentPin {
  readonly kind: "PAYMENT_MISSION";
  readonly direction: MissionIntentDirection;
  /** The free-text goal statement seed (may be revised during intake). */
  readonly goalStatement: string;
}

export type AgentTaskIntentPin = ConnectionSetupIntentPin | PaymentMissionIntentPin;

/* ====================================================================
 * The task envelope + events (mirrors the source shapes)
 * ==================================================================== */

/** Mirrors surface AgentTaskId. */
export type AgentTaskIdPin = string;

/** Mirrors surface AgentTaskEvent (append-only; explicit instants). */
export interface AgentTaskEventPin {
  readonly id: string;
  /** ISO-8601 UTC instant — explicit input, never ambient. */
  readonly at: string;
  readonly kind: AgentTaskEventKindPin;
  /** People-language summary (the writer escape-scans; no secret material). */
  readonly summary: string;
  readonly correlationRef?: string;
}

/**
 * Mirrors surface AGENT_TASK_MODEL_DISCLOSURE_NOTE VERBATIM (P21-B, D4 —
 * the honest no-narration-tier law): the selected model is RECORDED and
 * drives real budget knobs — it never authors the financial facts, routes
 * or scores, and no LLM narration tier is composed in this wave. Rendered
 * VERBATIM whenever a model is selected (drift is caught by the mirror
 * test byte-for-byte).
 */
export const AGENT_TASK_MODEL_DISCLOSURE_NOTE_PIN =
  "The model and difficulty you pick are recorded with this task and drive the routine's real budget knobs (search, scenarios, explanation detail). The financial computation stays deterministic and model-independent: no model authored the amounts, routes, scores or provider facts shown here, and no model narration tier is composed in this deployment — every financial fact comes from the deterministic engines and provider evidence." as const;

/**
 * Mirrors surface AgentTaskModelSelection (P21-B, D4): the persisted
 * model + difficulty selection on a task record — hydrated from the
 * substrate's REAL model-selection service (never a fabricated list),
 * persisted through the ONE task-session port and restored on resume.
 * The selection NEVER confers eligibility, authorization or security
 * rights (the financial computation stays model-independent).
 */
export interface AgentTaskModelSelectionPin {
  /** The substrate provider id (e.g. "zai") — opaque here. */
  readonly providerId: string;
  /** The substrate model id (e.g. "glm-5.2") — opaque here. */
  readonly modelId: string;
  /** The model's OWN reasoning-level value (the difficulty; provider-pinned vocabulary). */
  readonly reasoningLevel: string;
}

/** Mirrors surface AgentTask. */
export interface AgentTaskPin {
  readonly id: AgentTaskIdPin;
  readonly kind: AgentTaskKindPin;
  readonly intent: AgentTaskIntentPin;
  readonly origin: AgentTaskOriginPin;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: AgentTaskStatusPin;
  /** Append-only history (the writer appends, never rewrites). */
  readonly events: readonly AgentTaskEventPin[];
  /** (P21-B, D4) The persisted model + difficulty selection (absent = never selected). */
  readonly modelSelection?: AgentTaskModelSelectionPin;
}

/* ====================================================================
 * Convergence: the resume key + window (ADR-0007 D6)
 * ==================================================================== */

/** Mirrors surface AGENT_TASK_RESUME_WINDOW_SECONDS (900). */
export const AGENT_TASK_RESUME_WINDOW_SECONDS_PIN = 900;

/** Mirrors surface AGENT_TASK_STATE_LIFETIME_SECONDS (600; ADR-0007 D3). */
export const AGENT_TASK_STATE_LIFETIME_SECONDS_PIN = 600;

/**
 * Mirrors surface agentTaskResumeKey: entrypoints that produce the SAME
 * key seed-or-resume the SAME task (a Stripe Connect-card click and a
 * resolved "connect Stripe" text produce identical keys — the typed form
 * of the UX reference's convergence requirement).
 */
export function agentTaskResumeKeyPin(intent: AgentTaskIntentPin): string {
  switch (intent.kind) {
    case "CONNECTION_SETUP":
      return `connection:${intent.providerId}:${intent.form}`;
    case "PAYMENT_MISSION":
      return `payment:${intent.direction}`;
  }
}

/* ====================================================================
 * The seed-decision fold lives in ./agent-task-validation.ts
 * (mirroring the source's own split for the <=400-line file law:
 * agent-tasks.ts = vocabulary + resume key; agent-task-validation.ts =
 * fail-closed validators + the resolveAgentTaskSeed fold).
 * ==================================================================== */

/** Mirrors surface AgentTaskSeedDecision. */
export interface AgentTaskSeedDecisionPin {
  readonly action: "CREATE" | "RESUME";
  /** Present iff action is RESUME — the task to resume. */
  readonly taskId?: AgentTaskIdPin;
  /** The origin recorded on CREATED events by the adapter (informational). */
  readonly origin?: AgentTaskOriginPin;
}

/** The fold signature the shared contract exports (for injection typing). */
export type AgentTaskSeedFold = (
  intent: AgentTaskIntentPin,
  existing: readonly AgentTaskPin[],
  now: string,
) => AgentTaskSeedDecisionPin;
