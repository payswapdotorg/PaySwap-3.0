/**
 * @payswap/app — the AGENT TASK-SESSION PORT (P13-A, ADR-0007 D6/D7).
 *
 * The app-side port over the shared AgentTask shape, following the
 * WorkspaceStorePort pattern (src/console/contracts.ts §5): the ONLY
 * mutation surface of the composer's task records. Adapters implement
 * it (the in-app BROWSER_PROFILE localStorage adapter here; the desktop
 * host binding lands at TL integration — P13-D, DURABILITY
 * DESKTOP_PROFILE).
 *
 * LAWS:
 * - ZERO FINANCIAL AUTHORITY (ADR-0007 D7): the port records demand-side
 *   orchestration only. Nothing here dispatches, authorizes, settles or
 *   observes a provider. No balances, no provider state, no finality.
 * - CONVERGENCE: seedOrResume applies the shared contract's seed fold
 *   (resolveAgentTaskSeed — pinned app-side, injectable so the host can
 *   supply the real one); entrypoints with the same resume key resume
 *   the same task inside the window, never duplicate it.
 * - APPEND-ONLY events; explicit `now` instants (never ambient); ids
 *   adapter-minted, monotonic, never reused.
 * - HONEST ORIGINS: seeding with the declared-unsupported COMPOSER_VOICE
 *   origin fails closed (typed error) — voice is never simulated.
 * - Fail-closed typed errors; a rejected call never silently coerces.
 */

import type {
  AgentTaskEventKindPin,
  AgentTaskIntentPin,
  AgentTaskOriginPin,
  AgentTaskPin,
  AgentTaskStatusPin,
} from "../lib/agent-task-pins.js";

/** The honest durability label (the desktop host binding lands at P13-D). */
export type AgentTaskSessionDurability = "BROWSER_PROFILE";

/* ----------------------------- typed errors ------------------------- */

export type AgentTaskSessionErrorCode =
  | "STORE_UNAVAILABLE"
  | "STORE_WRITE_FAILED"
  | "INVALID_INPUT"
  | "UNSUPPORTED_ORIGIN"
  | "UNKNOWN_TASK"
  | "TERMINAL_TASK"
  | "SECRET_SHAPED_INPUT";

/** The typed, fail-closed store error (never stringly-typed control flow). */
export class AgentTaskSessionError extends Error {
  readonly code: AgentTaskSessionErrorCode;
  constructor(code: AgentTaskSessionErrorCode, message: string) {
    super(message);
    this.name = "AgentTaskSessionError";
    this.code = code;
  }
}

/* ------------------------------ the inputs -------------------------- */

/** One seed request from ANY supported entrypoint (card click, composer text, system). */
export interface AgentTaskSeedInput {
  /** The typed intent (validated fail-closed before the fold runs). */
  readonly intent: AgentTaskIntentPin;
  /** The entrypoint origin — must be a SUPPORTED origin (never COMPOSER_VOICE). */
  readonly origin: AgentTaskOriginPin;
  /** ISO-8601 UTC instant — explicit input, never ambient. */
  readonly now: string;
  /** People-language line recorded on the CREATED/RESUMED event (escape-scanned). */
  readonly originNote: string;
}

/** The outcome of the convergence fold, with the resulting record. */
export interface AgentTaskSeedOutcome {
  readonly action: "CREATED" | "RESUMED";
  readonly task: AgentTaskPin;
}

/** The honest health report (quarantined records surfaced, never hidden). */
export interface AgentTaskSessionHealth {
  /** Records excluded from loading because they failed validation. */
  readonly quarantinedRecords: number;
  /** Tasks currently held (post-quarantine). */
  readonly taskCount: number;
}

/* ------------------------------- the port --------------------------- */

/**
 * The task-session port. The composer talks to task records ONLY
 * through this interface — the same discipline as the workspace store
 * port (§5): the UI is a projection; the adapter owns persistence.
 */
export interface AgentTaskSessionPort {
  /** The honest durability label of this adapter. */
  readonly durability: AgentTaskSessionDurability;
  listTasks(): Promise<readonly AgentTaskPin[]>;
  taskDetail(id: string): Promise<AgentTaskPin | null>;
  /**
   * The convergence entrypoint: CREATE a task for the intent, or RESUME
   * the in-window resumable task with the same resume key (the shared
   * contract's resolveAgentTaskSeed fold — one task record, never a
   * duplicate).
   */
  seedOrResume(input: AgentTaskSeedInput): Promise<AgentTaskSeedOutcome>;
  /**
   * A status transition. Fail-closed: unknown ids, unknown statuses,
   * unknown event kinds, and any transition OUT of a terminal status
   * (the monotonic-terminal law) throw typed errors. The event kind is
   * the CALLER's explicit choice from the pinned vocabulary — the
   * adapter never invents evidence vocabulary.
   */
  updateTaskStatus(
    id: string,
    toStatus: AgentTaskStatusPin,
    eventKind: AgentTaskEventKindPin,
    now: string,
    summary: string,
    correlationRef?: string,
  ): Promise<AgentTaskPin>;
  /** Append one event to the task's timeline (append-only; never rewrites). */
  appendTaskEvent(
    id: string,
    eventKind: AgentTaskEventKindPin,
    now: string,
    summary: string,
    correlationRef?: string,
  ): Promise<AgentTaskPin>;
  /** The honest health report. */
  taskSessionHealth(): AgentTaskSessionHealth;
}
