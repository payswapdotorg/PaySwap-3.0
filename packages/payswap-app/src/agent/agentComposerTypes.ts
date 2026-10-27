/**
 * @payswap/app — the AGENT COMPOSER controller contracts (P13-A).
 *
 * The public types of the composer controller, split out of
 * ./agentComposerController.ts for the ≤400-line file law. The
 * controller module re-exports them unchanged (its consumers import
 * from either — one canonical implementation, two convenient doors).
 */

import type { AgentTaskIntentPin } from "../lib/agent-task-pins.js";
import type { RoutedAgentIntent } from "./intentRouter.js";
import type { AgentTaskSessionStorage } from "./taskSessionAdapter.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";
import type { AgentComposerTaskView } from "./agentComposerProjection.js";
import type { AgentComposerTranscriptEntry } from "./agentComposerUiState.js";
import type { MissionIntakePlanePort, MissionIntakeState } from "./missionIntakePins.js";

/* ------------------------------ the state --------------------------- */

/** The composer's toggle states (minimize/reopen never loses context). */
export type AgentComposerMode = "closed" | "minimized" | "open";

export type { AgentComposerTranscriptEntry } from "./agentComposerUiState.js";

export interface AgentComposerState {
  readonly mode: AgentComposerMode;
  /** The area label of the last entrypoint that opened the composer. */
  readonly entryArea: string | null;
  readonly draftText: string;
  readonly entries: readonly AgentComposerTranscriptEntry[];
  readonly tasks: readonly AgentComposerTaskView[];
  readonly tasksPhase: "loading" | "ready" | "error";
  readonly tasksError: string | null;
  readonly sendPhase: "idle" | "sending";
  /** The honest UI-state persistence fact. */
  readonly uiPersistence: "browser-profile" | "memory-only";
  /** (P21-B, D2) The mission-intake binding's projected state (UNBOUND without a plane). */
  readonly missionIntake: MissionIntakeState;
}

/** A surface-action seed request (card clicks and area entries). */
export interface AgentComposerSurfaceSeed {
  readonly intent: AgentTaskIntentPin;
  /** People-language provenance note recorded on the task event. */
  readonly originNote: string;
  /** The area id the entry lives on (e.g. "connections"). */
  readonly area: string;
  /**
   * Open the floating composer panel after the seed (default true). A
   * surface that renders its OWN embedded composer panel (e.g. the
   * connections page's inline agent panel) passes false: the seed and
   * its transcript land in the shared state either way — only the
   * floating panel's visibility changes, never the orchestration.
   */
  readonly openPanel?: boolean;
}

export interface AgentComposerControllerOptions {
  /** The task-session port (default: the shared BROWSER_PROFILE adapter). */
  readonly session?: AgentTaskSessionPort;
  /** The UI-state storage seam (default: the ambient localStorage, best-effort). */
  readonly storage?: AgentTaskSessionStorage;
  /** Injectable clock — ISO-8601 UTC instants (tests pin it). */
  readonly clock?: () => string;
  /** Injectable typed-intent router (tests pin it; never an LLM). */
  readonly route?: (text: string) => RoutedAgentIntent;
  /** The transcript bound (default 60 — the persisted conversation cap). */
  readonly entryCap?: number;
  /**
   * (P21-B, ADR-0014 D2) The mission-plane port: when bound, the
   * composer's PAYMENT_MISSION intents seed REAL missions and the
   * deterministic ask/capture loop surfaces in the conversation. Absent
   * (the web tier) — the honest unbound note, never a faked mission.
   */
  readonly missionIntakePlane?: MissionIntakePlanePort;
}

export interface AgentComposerController {
  getState(): AgentComposerState;
  subscribe(listener: () => void): () => void;
  /** Open the composer (from the dock or an entry point). */
  open(entry?: { readonly area?: string }): void;
  /** Collapse to the dock — state, draft and history are all kept. */
  minimize(): void;
  /** Hide the composer from the surface — state is still kept. */
  close(): void;
  setDraft(text: string): void;
  /** Route the draft through the ONE typed intent path and seed. */
  send(): Promise<void>;
  /** Seed a task from a surface action (card clicks; converges with text). */
  seedFromSurface(seed: AgentComposerSurfaceSeed): Promise<void>;
  /** Cancel a task RECORD (zero financial authority — an orchestration close). */
  cancelTask(taskId: string): Promise<void>;
  /** Reload the task list from the session port (honest phases). */
  refresh(): Promise<void>;
  /**
   * The controller's ONE task-session port (P17-C, ADR-0010 D5): the
   * composition seam a platform host uses to bind a route-planning
   * session over the SAME store the composer reads and writes — two
   * adapters over the one storage key would race on the monotonic
   * counters (whole-snapshot writes), so the host MUST share this
   * instance, never construct a second one.
   */
  sessionPort(): AgentTaskSessionPort;
}
