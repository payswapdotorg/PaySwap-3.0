/**
 * @payswap/app — the BROWSER_PROFILE agent task-session adapter (P13-A).
 *
 * The in-app AgentTaskSessionPort implementation so the composer works
 * STANDALONE, honestly labeled like the workspace store's BROWSER_PROFILE
 * discipline (packages/web/src/payswap/workspaceStore.ts):
 *
 * - The snapshot persists as ONE JSON blob under the namespaced
 *   localStorage key "payswap.agent.tasks.v1" — honest labeling: the
 *   records live in THIS browser profile only, survive reloads, and are
 *   NOT synced anywhere. The DESKTOP_PROFILE host binding (the
 *   IPaySwapDesktopService seam) lands at TL integration (P13-D).
 * - The CONVERGENCE fold is INJECTABLE (default: the pinned mirror of
 *   the shared contract's resolveAgentTaskSeed, verified equivalent by
 *   the mirror test) — the desktop host binding can supply the shared
 *   fold itself.
 * - `now` is always an EXPLICIT input, checked against the SAME strict
 *   ISO-8601 UTC regex the pinned validators enforce; ids are
 *   adapter-minted, monotonic and never reused; events are APPEND-ONLY;
 *   the monotonic-terminal law is enforced fail-closed.
 * - A malformed persisted record is QUARANTINED — counted in the honest
 *   health report, never rendered as a task, never silently dropped.
 * - A failed write REVERTS the in-memory state and fails closed with a
 *   typed error — memory and storage never silently diverge.
 * - CHAT LAW (UX reference / ADR-0007 D4): secret-shaped material is
 *   REFUSED at the writer (./taskSessionGuard.ts) — it never enters a
 *   task transcript.
 *
 * ZERO FINANCIAL AUTHORITY (ADR-0007 D7): demand-side orchestration
 * records only — the adapter cannot dispatch, authorize, settle or
 * observe anything.
 *
 * The persistence mechanics live in ./taskSessionSnapshot.ts (the
 * <=400-line file law split).
 */

import {
  AGENT_TASK_STATUSES_PIN,
  SUPPORTED_AGENT_TASK_ORIGINS_PIN,
  type AgentTaskEventPin,
  type AgentTaskIntentPin,
  type AgentTaskOriginPin,
  type AgentTaskPin,
  type AgentTaskSeedFold,
} from "../lib/agent-task-pins.js";
import { resolvePinnedAgentTaskSeed, validatePinnedAgentTaskIntent, validatePinnedModelSelection } from "../lib/agent-task-validation.js";
import {
  AgentTaskSessionError,
  type AgentTaskSeedInput,
  type AgentTaskSeedOutcome,
  type AgentTaskSessionHealth,
  type AgentTaskSessionPort,
} from "./taskSessionPort.js";
import {
  advanceEventNumber,
  defaultStorage,
  EMPTY_SNAPSHOT,
  loadTaskSnapshot,
  mintTaskEvent,
  requireEventKind,
  requireIsoInstantUtc,
  reviseTaskWithEvent,
  serializeTaskSnapshot,
  type AgentTaskSessionStorage,
  type TaskSnapshot,
} from "./taskSessionSnapshot.js";
import { AGENT_TASK_SESSION_LOCALSTORAGE_KEY } from "./taskSessionSnapshot.js";
import { scanAgentTranscriptText } from "./taskSessionGuard.js";

export { AGENT_TASK_SESSION_LOCALSTORAGE_KEY } from "./taskSessionSnapshot.js";
export type { AgentTaskSessionStorage } from "./taskSessionSnapshot.js";
export { scanAgentTranscriptText } from "./taskSessionGuard.js";

/* ----------------------------- the adapter -------------------------- */

export interface BrowserAgentTaskSessionOptions {
  /** The storage seam (default: the ambient localStorage, bound lazily). */
  readonly storage?: AgentTaskSessionStorage;
  /**
   * The convergence fold (default: the pinned mirror of the shared
   * contract's resolveAgentTaskSeed). The desktop host binding (P13-D)
   * injects the shared fold; the mirror test verifies the two agree.
   */
  readonly resolveSeed?: AgentTaskSeedFold;
}

interface AdapterState {
  snapshot: TaskSnapshot;
  quarantined: number;
}

/**
 * Create the BROWSER_PROFILE task-session adapter (the standalone store
 * the composer works against; deterministic under a fixed `now` input).
 */
export function createBrowserAgentTaskSessionPort(
  options?: BrowserAgentTaskSessionOptions,
): AgentTaskSessionPort {
  const storage = options?.storage;
  const resolveSeed = options?.resolveSeed ?? resolvePinnedAgentTaskSeed;

  const state: AdapterState = { snapshot: EMPTY_SNAPSHOT, quarantined: 0 };
  let loaded = false;

  const bindStorage = (): AgentTaskSessionStorage =>
    storage === undefined ? defaultStorage() : storage;

  /** Load + validate the snapshot once (fail-closed quarantine per record). */
  const ensureLoaded = (): void => {
    if (loaded) {
      return;
    }
    loaded = true;
    // A MISSING storage fails closed (typed) — the adapter cannot persist;
    // an unreadable existing storage starts honestly empty (in the core).
    const outcome = loadTaskSnapshot(bindStorage());
    state.snapshot = outcome.snapshot;
    state.quarantined = outcome.quarantined;
  };

  /** Persist (fail-closed; a failed write reverts the in-memory state). */
  const persist = (next: TaskSnapshot): void => {
    const before = state.snapshot;
    try {
      bindStorage().setItem(AGENT_TASK_SESSION_LOCALSTORAGE_KEY, serializeTaskSnapshot(next));
    } catch (thrown: unknown) {
      state.snapshot = before;
      throw new AgentTaskSessionError(
        "STORE_WRITE_FAILED",
        `the agent task store could not persist its snapshot (${thrown instanceof Error ? thrown.message : String(thrown)}) — the change was reverted`,
      );
    }
    state.snapshot = next;
  };

  const requireStatus = (value: AgentTaskPin["status"]): void => {
    if (!(AGENT_TASK_STATUSES_PIN as readonly string[]).includes(value)) {
      throw new AgentTaskSessionError(
        "INVALID_INPUT",
        `status '${String(value)}' is not in the pinned task-status vocabulary`,
      );
    }
  };

  const findTask = (id: string): AgentTaskPin => {
    const task = state.snapshot.tasks.find((entry) => entry.id === id);
    if (task === undefined) {
      throw new AgentTaskSessionError("UNKNOWN_TASK", `no agent task exists with id '${id}'`);
    }
    return task;
  };

  const replaceTask = (snapshot: TaskSnapshot, revised: AgentTaskPin): TaskSnapshot => ({
    ...snapshot,
    tasks: snapshot.tasks.map((entry) => (entry.id === revised.id ? revised : entry)),
  });

  return {
    durability: "BROWSER_PROFILE",

    async listTasks(): Promise<readonly AgentTaskPin[]> {
      ensureLoaded();
      return [...state.snapshot.tasks];
    },

    async taskDetail(id: string): Promise<AgentTaskPin | null> {
      ensureLoaded();
      const task = state.snapshot.tasks.find((entry) => entry.id === id);
      return task === undefined ? null : task;
    },

    async seedOrResume(input: AgentTaskSeedInput): Promise<AgentTaskSeedOutcome> {
      ensureLoaded();
      const intent = validatePinnedAgentTaskIntent(input.intent);
      if (!(SUPPORTED_AGENT_TASK_ORIGINS_PIN as readonly string[]).includes(input.origin)) {
        throw new AgentTaskSessionError(
          "UNSUPPORTED_ORIGIN",
          `origin '${input.origin}' is not supported in this deployment — COMPOSER_VOICE is declared-unsupported and is never simulated`,
        );
      }
      requireIsoInstantUtc(input.now, "now");
      const note = input.originNote.trim();
      if (note.length === 0) {
        throw new AgentTaskSessionError("INVALID_INPUT", "originNote must be a non-empty string");
      }
      scanAgentTranscriptText(note);
      if (intent.kind === "PAYMENT_MISSION") {
        scanAgentTranscriptText(intent.goalStatement);
      }

      const decision = resolveSeed(intent, state.snapshot.tasks, input.now);
      if (decision.action === "RESUME") {
        const taskId = decision.taskId;
        if (taskId === undefined) {
          throw new AgentTaskSessionError(
            "INVALID_INPUT",
            "the seed fold returned RESUME without a task id",
          );
        }
        const existing = findTask(taskId);
        const event = mintTaskEvent(
          state.snapshot,
          "RESUMED",
          input.now,
          `Resumed from ${originLabel(input.origin)}: ${note}`,
        );
        const revised = reviseTaskWithEvent(existing, event);
        persist(replaceTask(advanceEventNumber(state.snapshot), revised));
        return { action: "RESUMED", task: revised };
      }

      const id = `task:${intent.kind}:${state.snapshot.nextTaskNumber}`;
      const event = mintTaskEvent(
        state.snapshot,
        "CREATED",
        input.now,
        `Task created from ${originLabel(input.origin)}: ${note}`,
      );
      const task: AgentTaskPin = {
        id,
        kind: intent.kind,
        intent,
        origin: input.origin,
        createdAt: input.now,
        updatedAt: input.now,
        status: "DRAFT",
        events: [event],
      };
      persist({
        ...advanceEventNumber(state.snapshot),
        nextTaskNumber: state.snapshot.nextTaskNumber + 1,
        tasks: [...state.snapshot.tasks, task],
      });
      return { action: "CREATED", task };
    },

    async updateTaskStatus(
      id: string,
      toStatus: AgentTaskPin["status"],
      eventKind: AgentTaskEventPin["kind"],
      now: string,
      summary: string,
      correlationRef?: string,
    ): Promise<AgentTaskPin> {
      ensureLoaded();
      requireStatus(toStatus);
      requireEventKind(eventKind);
      requireIsoInstantUtc(now, "now");
      const existing = findTask(id);
      // The monotonic-terminal law: terminal statuses have no exits.
      if (isTerminal(existing.status)) {
        throw new AgentTaskSessionError(
          "TERMINAL_TASK",
          `task '${id}' is ${existing.status} — a terminal status has no lawful exit (the monotonic-terminal law)`,
        );
      }
      scanAgentTranscriptText(summary);
      const event = mintTaskEvent(state.snapshot, eventKind, now, summary, correlationRef);
      const revised = reviseTaskWithEvent({ ...existing, status: toStatus }, event);
      persist(replaceTask(advanceEventNumber(state.snapshot), revised));
      return revised;
    },

    async appendTaskEvent(
      id: string,
      eventKind: AgentTaskEventPin["kind"],
      now: string,
      summary: string,
      correlationRef?: string,
    ): Promise<AgentTaskPin> {
      ensureLoaded();
      requireEventKind(eventKind);
      requireIsoInstantUtc(now, "now");
      const existing = findTask(id);
      scanAgentTranscriptText(summary);
      const event = mintTaskEvent(state.snapshot, eventKind, now, summary, correlationRef);
      const revised = reviseTaskWithEvent(existing, event);
      persist(replaceTask(advanceEventNumber(state.snapshot), revised));
      return revised;
    },

    async recordModelSelection(
      id: string,
      selection: AgentTaskPin["modelSelection"],
      now: string,
    ): Promise<AgentTaskPin> {
      ensureLoaded();
      // (P21-B, D4) The surface contract's optional FIELD is the record:
      // validated fail-closed, stamped on the task, updatedAt advanced so
      // the projection reorders honestly. NO event kind exists for it (the
      // closed vocabulary law) — the field IS the persisted selection.
      const validated = validatePinnedModelSelection(selection);
      requireIsoInstantUtc(now, "now");
      const existing = findTask(id);
      if (isTerminal(existing.status)) {
        throw new AgentTaskSessionError(
          "TERMINAL_TASK",
          `task '${id}' is ${existing.status} — a terminal task records no model selection (the monotonic-terminal law)`,
        );
      }
      const revised: AgentTaskPin = { ...existing, modelSelection: validated, updatedAt: now };
      persist(replaceTask(state.snapshot, revised));
      return revised;
    },

    taskSessionHealth(): AgentTaskSessionHealth {
      ensureLoaded();
      return {
        quarantinedRecords: state.quarantined,
        taskCount: state.snapshot.tasks.length,
      };
    },
  };
}

/** The pinned terminal statuses (monotonic — no lawful exits). */
const TERMINAL_STATUSES: readonly string[] = ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"];

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** People-language origin labels for event summaries (honest provenance). */
function originLabel(origin: AgentTaskOriginPin): string {
  switch (origin) {
    case "SURFACE_ACTION":
      return "a surface action";
    case "COMPOSER_TEXT":
      return "composer text";
    case "SYSTEM":
      return "the system";
    case "COMPOSER_VOICE":
      return "voice input";
  }
}

/**
 * The intent a seed request carries, re-exposed for adapter consumers
 * (typed helper; validates fail-closed).
 */
export function validatedSeedIntent(intent: AgentTaskIntentPin): AgentTaskIntentPin {
  return validatePinnedAgentTaskIntent(intent);
}
