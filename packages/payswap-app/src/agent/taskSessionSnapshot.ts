/**
 * @payswap/app — the agent task-session SNAPSHOT core (P13-A).
 *
 * Split from ./taskSessionAdapter.ts for the <=400-line file law (the
 * established package discipline). Owns the PERSISTENCE mechanics the
 * BROWSER_PROFILE adapter runs on:
 *
 * - the namespaced localStorage key + the minimal storage seam (tests
 *   inject fakes; the adapter binds the ambient localStorage lazily);
 * - the versioned snapshot shape (tasks + the monotonic id counters);
 * - loadTaskSnapshot: parse + fail-closed per-record validation with
 *   QUARANTINE (malformed records are counted for the honest health
 *   report, never rendered, never silently dropped — good records in
 *   the same snapshot still load);
 * - persistTaskSnapshot: serialization for the fail-closed write path
 *   (the adapter owns the revert-on-failure discipline);
 * - the STRICT ISO-8601 UTC instant check (the same regex the pinned
 *   validators enforce — a write that would not reload cleanly is
 *   refused at the writer, never persisted to be quarantined later);
 * - the pure event-mint/revise helpers (ids stay monotonic and unique;
 *   events append, never rewrite).
 */

import { AGENT_TASK_EVENT_KINDS_PIN, type AgentTaskEventPin, type AgentTaskPin } from "../lib/agent-task-pins.js";
import { validatePinnedAgentTask } from "../lib/agent-task-validation.js";
import {
  validateConversationLogInput,
  type AgentConversationLogEvent,
  type AgentConversationLogInput,
} from "./conversationLogEvents.js";
import { AgentTaskSessionError } from "./taskSessionPort.js";

/* ------------------------ the storage seam -------------------------- */

/** The namespaced localStorage key (one snapshot, versioned). */
export const AGENT_TASK_SESSION_LOCALSTORAGE_KEY = "payswap.agent.tasks.v1";

/** The minimal storage seam the adapter needs (localStorage-shaped; tests inject fakes). */
export interface AgentTaskSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultStorage(): AgentTaskSessionStorage {
  // Lazy: importing this module in a storage-less context never throws;
  // the adapter fails closed (typed) only when actually used.
  const storage = (globalThis as { localStorage?: Storage }).localStorage;
  if (storage === undefined) {
    throw new AgentTaskSessionError(
      "STORE_UNAVAILABLE",
      "localStorage is not available in this context — the BROWSER_PROFILE agent task store cannot persist task records here",
    );
  }
  return storage;
}

/* ------------------------- the snapshot shape ----------------------- */

/** The persisted snapshot: the task records + the monotonic id counters. */
export interface TaskSnapshot {
  readonly version: 1;
  readonly nextTaskNumber: number;
  readonly nextEventNumber: number;
  readonly tasks: readonly AgentTaskPin[];
  /** (P24-3) The append-only conversation logs, keyed by task id (absent in pre-P24-3 snapshots → empty). */
  readonly conversations?: Readonly<Record<string, readonly AgentConversationLogEvent[]>>;
  /** (P24-3) The conversation-event id counter (monotonic, never reused). */
  readonly nextConversationEventNumber?: number;
}

export const EMPTY_SNAPSHOT: TaskSnapshot = {
  version: 1,
  nextTaskNumber: 1,
  nextEventNumber: 1,
  tasks: [],
};

/** The load outcome: the surviving snapshot + the quarantine count. */
export interface LoadedTaskSnapshot {
  readonly snapshot: TaskSnapshot;
  readonly quarantined: number;
}

/**
 * Load + validate a snapshot from storage (fail-closed quarantine per
 * record). An absent, unreadable or structurally invalid snapshot starts
 * honestly empty — data is never invented to fill a gap.
 */
export function loadTaskSnapshot(storage: AgentTaskSessionStorage): LoadedTaskSnapshot {
  let raw: string | null;
  try {
    raw = storage.getItem(AGENT_TASK_SESSION_LOCALSTORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw === null) {
    return { snapshot: EMPTY_SNAPSHOT, quarantined: 0 };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { snapshot: EMPTY_SNAPSHOT, quarantined: 0 };
  }
  const candidate = parsed as { version?: unknown; tasks?: unknown } | null;
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    candidate.version !== 1 ||
    !Array.isArray(candidate.tasks)
  ) {
    return { snapshot: EMPTY_SNAPSHOT, quarantined: 0 };
  }
  const tasks: AgentTaskPin[] = [];
  let quarantined = 0;
  for (const record of candidate.tasks) {
    try {
      tasks.push(validatePinnedAgentTask(record));
    } catch {
      // Quarantined: surfaced via the health report, never rendered,
      // never silently dropped (good records still load).
      quarantined += 1;
    }
  }
  const numbers = candidate as { nextTaskNumber?: unknown; nextEventNumber?: unknown; conversations?: unknown; nextConversationEventNumber?: unknown };
  return {
    snapshot: {
      version: 1,
      nextTaskNumber:
        typeof numbers.nextTaskNumber === "number" && numbers.nextTaskNumber >= 1
          ? numbers.nextTaskNumber
          : tasks.length + 1,
      nextEventNumber:
        typeof numbers.nextEventNumber === "number" && numbers.nextEventNumber >= 1
          ? numbers.nextEventNumber
          : 1,
      tasks,
      // (P24-3) Backward compatible: a snapshot without conversation
      // logs loads with an empty map; malformed log entries are dropped
      // from the replay (the health report's quarantine counts records,
      // the conversation replay fails closed per event at the writer).
      conversations: loadConversations(numbers.conversations),
      nextConversationEventNumber:
        typeof numbers.nextConversationEventNumber === "number" && numbers.nextConversationEventNumber >= 1
          ? numbers.nextConversationEventNumber
          : countConversationEvents(numbers.conversations) + 1,
    },
    quarantined,
  };
}

/** Load the conversations map (absent/malformed → empty; events validated). */
function loadConversations(
  candidate: unknown,
): Readonly<Record<string, readonly AgentConversationLogEvent[]>> {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }
  const conversations: Record<string, AgentConversationLogEvent[]> = {};
  for (const [taskId, events] of Object.entries(candidate as Record<string, unknown>)) {
    if (!Array.isArray(events)) {
      continue;
    }
    const loaded: AgentConversationLogEvent[] = [];
    for (const event of events) {
      try {
        const record = event as { id?: unknown; taskId?: unknown; at?: unknown; event?: unknown };
        if (typeof record.id !== "string" || record.taskId !== taskId || typeof record.at !== "string") {
          continue;
        }
        loaded.push({
          id: record.id,
          taskId,
          at: record.at,
          event: validateConversationLogInput(record.event),
        });
      } catch {
        // A malformed persisted event is excluded from replay (never
        // rendered, never silently rewritten).
        continue;
      }
    }
    conversations[taskId] = loaded;
  }
  return conversations;
}

function countConversationEvents(candidate: unknown): number {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return 0;
  }
  let count = 0;
  for (const events of Object.values(candidate as Record<string, unknown>)) {
    if (Array.isArray(events)) {
      count += events.length;
    }
  }
  return count;
}

/** Serialize a snapshot for persistence (the adapter wraps the write). */
export function serializeTaskSnapshot(snapshot: TaskSnapshot): string {
  return JSON.stringify(snapshot);
}

/* --------------------- the strict instant discipline ---------------- */

const ISO_8601_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * The STRICT instant check (the pinned validators' own regex): every
 * `now`/`at` the adapter records must be a real ISO-8601 UTC instant —
 * a lax parse that would later quarantine the record on reload is
 * refused at the writer instead.
 */
export function requireIsoInstantUtc(value: string, field: string): void {
  if (typeof value !== "string" || !ISO_8601_UTC_RE.test(value)) {
    throw new AgentTaskSessionError(
      "INVALID_INPUT",
      `${field} must be an ISO-8601 UTC instant (e.g. 2026-10-22T12:00:00Z)`,
    );
  }
}

/** Fail-closed event-kind vocabulary check (the pinned vocabulary only). */
export function requireEventKind(kind: AgentTaskEventPin["kind"]): void {
  if (!(AGENT_TASK_EVENT_KINDS_PIN as readonly string[]).includes(kind)) {
    throw new AgentTaskSessionError(
      "INVALID_INPUT",
      `event kind '${String(kind)}' is not in the pinned task-event vocabulary`,
    );
  }
}

/* ------------------------ the pure write helpers -------------------- */

/**
 * Mint one append-only event against a snapshot's counter (pure: the
 * caller persists the counter bump with the write; ids stay monotonic
 * and never reuse).
 */
export function mintTaskEvent(
  snapshot: TaskSnapshot,
  kind: AgentTaskEventPin["kind"],
  now: string,
  summary: string,
  correlationRef?: string,
): AgentTaskEventPin {
  requireEventKind(kind);
  return {
    id: `evt:${snapshot.nextEventNumber}`,
    at: now,
    kind,
    summary: summary.slice(0, 500),
    ...(correlationRef !== undefined ? { correlationRef } : {}),
  };
}

/** The bump that accompanies a minted event when the write persists. */
export function advanceEventNumber(snapshot: TaskSnapshot): TaskSnapshot {
  return { ...snapshot, nextEventNumber: snapshot.nextEventNumber + 1 };
}

/** (P24-3) Mint one append-only CONVERSATION event (ids monotonic per store). */
export function mintConversationEvent(
  snapshot: TaskSnapshot,
  taskId: string,
  event: AgentConversationLogInput,
  now: string,
): AgentConversationLogEvent {
  const validated = validateConversationLogInput(event);
  return {
    id: `conv:${snapshot.nextConversationEventNumber ?? 1}`,
    taskId,
    at: now,
    event: validated,
  };
}

/** (P24-3) The snapshot with one conversation event appended (pure). */
export function appendConversationToSnapshot(
  snapshot: TaskSnapshot,
  event: AgentConversationLogEvent,
): TaskSnapshot {
  const conversations = { ...snapshot.conversations };
  conversations[event.taskId] = [...(conversations[event.taskId] ?? []), event];
  return {
    ...snapshot,
    conversations,
    nextConversationEventNumber: (snapshot.nextConversationEventNumber ?? 1) + 1,
  };
}

/** Revise a task with an appended event (append-only; updatedAt = event at). */
export function reviseTaskWithEvent(task: AgentTaskPin, event: AgentTaskEventPin): AgentTaskPin {
  return { ...task, updatedAt: event.at, events: [...task.events, event] };
}
