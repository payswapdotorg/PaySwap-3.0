/**
 * @payswap/app — the AGENT COMPOSER UI-STATE persistence (P13-A).
 *
 * The composer's own persisted snapshot (mode + entry area + draft +
 * bounded transcript), split out of ./agentComposerController.ts for
 * the ≤400-line file law. LAWS:
 *
 * - Versioned + fail-closed: a malformed or unknown-version snapshot
 *   is discarded (null), never partially trusted; malformed transcript
 *   TAILS are dropped honestly (the well-formed prefix survives).
 * - Best-effort only: a failing write degrades to memory-only (the
 *   controller surfaces that fact honestly; nothing is invented).
 * - The transcript cap is applied at WRITE time (bounded persistence).
 */

import type { AgentTaskSessionStorage } from "./taskSessionAdapter.js";

/* ------------------------------ types ------------------------------- */

/** One conversation line (bounded; people language only). */
export interface AgentComposerTranscriptEntry {
  readonly id: string;
  /** ISO-8601 UTC instant — the explicit clock input at the mutation. */
  readonly at: string;
  readonly kind:
    | "USER_TEXT"
    | "AGENT_REPLY"
    | "SURFACE_ACTION"
    | "TASK_CREATED"
    | "TASK_RESUMED"
    | "TASK_CANCELLED"
    | "COMPOSER_ERROR";
  readonly text: string;
  /** The task record this line refers to (when it refers to one). */
  readonly taskId?: string;
}

/** The persisted UI snapshot (versioned). */
export interface ComposerUiSnapshot {
  readonly version: 1;
  readonly mode: "closed" | "minimized" | "open";
  readonly entryArea: string | null;
  readonly draftText: string;
  readonly entries: readonly AgentComposerTranscriptEntry[];
}

/* --------------------------- the persistence ------------------------- */

/** The namespaced UI-state key (composer mode + draft + transcript). */
export const AGENT_COMPOSER_UI_KEY = "payswap.agent.composer.ui.v1";

const MODES = ["closed", "minimized", "open"] as const;

/** Bind the ambient browser-profile storage (null when unavailable). */
export function bindUiStorage(storage?: AgentTaskSessionStorage): AgentTaskSessionStorage | null {
  if (storage !== undefined) {
    return storage;
  }
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** Read + validate the persisted snapshot (fail-closed). */
export function readUiSnapshot(store: AgentTaskSessionStorage | null): ComposerUiSnapshot | null {
  if (store === null) {
    return null;
  }
  try {
    const raw = store.getItem(AGENT_COMPOSER_UI_KEY);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ComposerUiSnapshot> | null;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      parsed.version !== 1 ||
      typeof parsed.mode !== "string" ||
      !MODES.includes(parsed.mode as (typeof MODES)[number]) ||
      typeof parsed.draftText !== "string" ||
      !Array.isArray(parsed.entries) ||
      (parsed.entryArea !== undefined && parsed.entryArea !== null && typeof parsed.entryArea !== "string")
    ) {
      return null;
    }
    // Validate each entry structurally; drop malformed tails honestly.
    const entries = parsed.entries.filter(
      (entry): entry is AgentComposerTranscriptEntry =>
        entry !== null &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        typeof entry.at === "string" &&
        typeof entry.kind === "string" &&
        typeof entry.text === "string",
    );
    return {
      version: 1,
      mode: parsed.mode as ComposerUiSnapshot["mode"],
      entryArea: parsed.entryArea ?? null,
      draftText: parsed.draftText,
      entries,
    };
  } catch {
    return null;
  }
}

/** Best-effort write (the caller degrades honestly on failure). */
export function writeUiSnapshot(
  store: AgentTaskSessionStorage | null,
  snapshot: ComposerUiSnapshot,
): boolean {
  if (store === null) {
    return false;
  }
  try {
    store.setItem(AGENT_COMPOSER_UI_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}
