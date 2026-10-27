/**
 * @payswap/surface — the shared agent-task contract (P13-0, ADR-0007 D6/D9).
 *
 * NET-NEW module: the ONE typed task envelope that unifies agent-led
 * entrypoints across the product (P13-A composer, P13-B connection tasks,
 * P13-C payment missions). Published by the TL BEFORE lane work as the
 * stable public contract (concurrency law: "publishing stable public
 * contracts before adapter/consumer work"); lanes implement adapters and
 * consumers against it, never edit it.
 *
 * COMPOSITION, not duplication (ADR-0007 D6):
 * - Payment-mission intents COMPOSE the pinned mission vocabulary
 *   (./console-missions.ts — same package, in-package import is lawful).
 * - Connection-form literals are pinned BY VALUE from
 *   @payswap/provider-runtime/src/connection-forms.ts (the boundary law:
 *   this package imports no siblings — same discipline as outcomes.ts
 *   pinning the P1-W1 intent kinds).
 *
 * LAWS enforced here (canonical + ADR-0007):
 * - ADVISORY ONLY (INV-23): an AgentTask is a demand-side orchestration
 *   record. It is NOT authorization, NOT financial truth, NOT capability
 *   state. Nothing in this module can dispatch, authorize or settle.
 * - CONVERGENCE (the UX reference's core requirement): surface actions,
 *   composer text and (when supported) voice seed or RESUME the same task
 *   by correlation key — `agentTaskResumeKey` computes it; a resumable
 *   task is resumed, never duplicated.
 * - HONEST ORIGINS: voice is ABSENT in this deployment; the vocabulary
 *   declares it and the surface must state it, never simulate it.
 * - MONOTONIC TERMINAL: terminal statuses have no exits.
 * - Single-use correlation states with bounded lifetime (ADR-0007 D3):
 *   outbound auth attempts mint state bindings that expire.
 *
 * Determinism: types and keys are pure; ids and states are minted by the
 * HOST adapter (crypto-random), never inside this package. Fail-closed
 * validation + the seed fold live in ./agent-task-validation.ts (the
 * <=400-line file law).
 */

import { surfaceProvenance, type SurfaceContractProvenance } from "./version.ts";
import type { MissionIntentDirection } from "./console-missions.ts";

/* ====================================================================
 * Vocabulary (closed, versioned)
 * ==================================================================== */

/** The task kinds the shared orchestration covers (extensible by MINOR bump). */
export const AGENT_TASK_KINDS = ["CONNECTION_SETUP", "PAYMENT_MISSION"] as const;
export type AgentTaskKind = (typeof AGENT_TASK_KINDS)[number];

/**
 * How the task was seeded. `COMPOSER_VOICE` is declared-unsupported in this
 * deployment (no ASR exists anywhere in the substrate or the app) — surfaces
 * must state that honestly, never simulate voice capture.
 */
export const AGENT_TASK_ORIGINS = [
  "SURFACE_ACTION",
  "COMPOSER_TEXT",
  "COMPOSER_VOICE",
  "SYSTEM",
] as const;
export type AgentTaskOrigin = (typeof AGENT_TASK_ORIGINS)[number];

/** Origins that are actually SUPPORTED in this deployment. */
export const SUPPORTED_AGENT_TASK_ORIGINS: readonly AgentTaskOrigin[] = Object.freeze([
  "SURFACE_ACTION",
  "COMPOSER_TEXT",
  "SYSTEM",
]);

/** The honest unsupported-voice statement (rendered verbatim, never bypassed). */
export const AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT =
  "Voice input is not supported in this deployment — there is no speech-to-text capability to route. Type your request instead; it reaches the same task system.";

/**
 * The task lifecycle. Terminal statuses (CANCELLED/COMPLETED/EXPIRED/FAILED)
 * are MONOTONIC — no lawful transition leaves them. WAITING_FOR_OPPORTUNITIES
 * (P16-D) is resumable and NON-terminal: a wait match records
 * OPPORTUNITY_MATCHED and the task STAYS WAITING.
 */
export const AGENT_TASK_STATUSES = [
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
export type AgentTaskStatus = (typeof AGENT_TASK_STATUSES)[number];

export const TERMINAL_AGENT_TASK_STATUSES: readonly AgentTaskStatus[] = Object.freeze([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

export function isTerminalAgentTaskStatus(status: AgentTaskStatus): boolean {
  return TERMINAL_AGENT_TASK_STATUSES.includes(status);
}

/** A task is resumable iff its status is non-terminal. */
export function isResumableAgentTaskStatus(status: AgentTaskStatus): boolean {
  return !isTerminalAgentTaskStatus(status);
}

/** Append-only task event kinds (the P16-D wait kinds are APPENDED after
 * EXPIRED, never inserted mid-list — the list's append-only spirit). */
export const AGENT_TASK_EVENT_KINDS = [
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
export type AgentTaskEventKind = (typeof AGENT_TASK_EVENT_KINDS)[number];

/**
 * The wait vocabulary (P16-D, ADR-0009 D8): a wait match records
 * OPPORTUNITY_MATCHED and the task STAYS WAITING (only cancel/expire/
 * fresh-approval move it); the app NEVER writes AUTHORIZATION_GRANTED for
 * a wait match — that event belongs to the real authority surface.
 * matchAutoDispatches is the LITERAL false, never a derived value.
 */
export const AGENT_TASK_WAIT_VOCABULARY = Object.freeze({
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
 * Connection-form literals pinned BY VALUE from
 * @payswap/provider-runtime/src/connection-forms.ts (boundary law: no
 * sibling imports; drift between the two lists is a two-step conscious
 * change, caught by the mirror discipline on the consumer side).
 */
export const AGENT_TASK_CONNECTION_FORMS = [
  "DELEGATED_OAUTH",
  "CONNECTED_ACCOUNT",
  "SCOPED_API_CREDENTIAL",
  "ISOLATED_INTERACTIVE_BROWSER_SESSION",
  "PROVIDERLESS_RAIL",
] as const;
export type AgentTaskConnectionForm = (typeof AGENT_TASK_CONNECTION_FORMS)[number];

/* ====================================================================
 * The typed intents (one per task kind)
 * ==================================================================== */

/** A provider-connection setup intent (P13-B domain). */
export interface ConnectionSetupIntent {
  readonly kind: "CONNECTION_SETUP";
  /** Registry provider id (e.g. "stripe"). Opaque here — the registry owns meaning. */
  readonly providerId: string;
  /** The connection form the setup uses (pinned vocabulary above). */
  readonly form: AgentTaskConnectionForm;
  /** The registry-declared use case being set up (e.g. "own-store-test-mode"). */
  readonly useCaseRef?: string;
}

/** A payment-mission intent (P13-C domain) — composes the mission vocabulary. */
export interface PaymentMissionIntent {
  readonly kind: "PAYMENT_MISSION";
  /** The mission direction (pinned mission vocabulary, composed). */
  readonly direction: MissionIntentDirection;
  /** The free-text goal statement seed (may be revised during intake). */
  readonly goalStatement: string;
}

export type AgentTaskIntent = ConnectionSetupIntent | PaymentMissionIntent;

/* ====================================================================
 * The task envelope + events
 * ==================================================================== */

/** Stable task id (host-minted; persisted with the record). */
export type AgentTaskId = string;

/** One append-only task event. */
export interface AgentTaskEvent {
  readonly id: string;
  /** ISO-8601 UTC instant — explicit input, never ambient. */
  readonly at: string;
  readonly kind: AgentTaskEventKind;
  /** People-language summary — escape-scanned by the writer (no secret material). */
  readonly summary: string;
  /** Correlation reference (idempotency key, state id, provider ref…). */
  readonly correlationRef?: string;
}

/* ====================================================================
 * The model/difficulty selection (P21-B, ADR-0014 D4 — additive)
 * ==================================================================== */

/**
 * The model + difficulty (reasoning level) selection a task record
 * carries (D4): hydrated from the substrate's REAL model-selection
 * service (never a fabricated list), persisted on the task record and
 * restored on resume. The selection NEVER confers eligibility,
 * authorization or security rights — the financial computation stays
 * deterministic and model-independent (the honest no-narration-tier
 * law; see AGENT_TASK_MODEL_DISCLOSURE_NOTE).
 */
export interface AgentTaskModelSelection {
  /** The substrate provider id (e.g. "zai") — opaque here. */
  readonly providerId: string;
  /** The substrate model id (e.g. "glm-5.2") — opaque here. */
  readonly modelId: string;
  /** The model's OWN reasoning-level value (the difficulty; provider-pinned vocabulary). */
  readonly reasoningLevel: string;
}

/**
 * The honest no-narration-tier disclosure (D4, rendered VERBATIM): the
 * selected model is RECORDED and drives real budget knobs — it never
 * authors the financial facts, routes or scores, and no LLM narration
 * tier is composed in this wave.
 */
export const AGENT_TASK_MODEL_DISCLOSURE_NOTE =
  "The model and difficulty you pick are recorded with this task and drive the routine's real budget knobs (search, scenarios, explanation detail). The financial computation stays deterministic and model-independent: no model authored the amounts, routes, scores or provider facts shown here, and no model narration tier is composed in this deployment — every financial fact comes from the deterministic engines and provider evidence." as const;

/** The shared task envelope. */
export interface AgentTask {
  readonly id: AgentTaskId;
  readonly kind: AgentTaskKind;
  readonly intent: AgentTaskIntent;
  readonly origin: AgentTaskOrigin;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: AgentTaskStatus;
  /** Append-only history (structural law: the writer appends, never rewrites). */
  readonly events: readonly AgentTaskEvent[];
  /** (P21-B, D4) The persisted model + difficulty selection (absent = never selected). */
  readonly modelSelection?: AgentTaskModelSelection;
}

/* ====================================================================
 * Convergence: the resume key (ADR-0007 D6)
 * ==================================================================== */

/**
 * The correlation window within which a re-seeded entrypoint RESUMES the
 * existing task instead of creating a duplicate (seconds; the adapter
 * compares against the task's updatedAt).
 */
export const AGENT_TASK_RESUME_WINDOW_SECONDS = 900;

/**
 * The convergence key: entrypoints that produce the SAME key seed-or-resume
 * the SAME task. A Connect-card click on Stripe (SCOPED_API_CREDENTIAL) and
 * a "connect Stripe" composer text with the same resolved intent produce
 * identical keys — this is the typed form of the UX reference's requirement.
 */
export function agentTaskResumeKey(intent: AgentTaskIntent): string {
  switch (intent.kind) {
    case "CONNECTION_SETUP":
      return `connection:${intent.providerId}:${intent.form}`;
    case "PAYMENT_MISSION":
      return `payment:${intent.direction}`;
  }
}

/* ====================================================================
 * External-return correlation (ADR-0007 D3)
 * ==================================================================== */

/** Default single-use auth-state lifetime (seconds; 10 minutes). */
export const AGENT_TASK_STATE_LIFETIME_SECONDS = 600;

/**
 * A single-use outbound auth binding: minted host-side, never
 * renderer-visible, consumed exactly once on validated return.
 */
export interface AgentTaskStateBinding {
  /** Crypto-random single-use state (opaque; host-minted). */
  readonly state: string;
  readonly taskId: AgentTaskId;
  readonly providerId: string;
  readonly form: AgentTaskConnectionForm;
  /** ISO-8601 UTC expiry instant. */
  readonly expiresAt: string;
  readonly consumedAt: string | null;
}

/* ====================================================================
 * Provenance (the stability-boundary discipline)
 * ==================================================================== */

export const AGENT_TASKS_PROVENANCE: SurfaceContractProvenance = surfaceProvenance(
  "P13-0",
  "experimental",
);
