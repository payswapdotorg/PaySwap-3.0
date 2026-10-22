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
}

/** A surface-action seed request (card clicks and area entries). */
export interface AgentComposerSurfaceSeed {
  readonly intent: AgentTaskIntentPin;
  /** People-language provenance note recorded on the task event. */
  readonly originNote: string;
  /** The area id the entry lives on (e.g. "connections"). */
  readonly area: string;
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
}
