/**
 * @payswap/app — the AGENT COMPOSER PROJECTIONS (P13-A, pure).
 *
 * The pure view-model folds for the composer UI: status pills, task
 * titles, the ordered task list, the transcript entry views and the
 * pinned honest notes the panel renders. No React, no DOM, no ambient
 * state — same discipline as the console section folds (§6).
 *
 * HONESTY LAWS (ADR-0007 D7 + the UX reference):
 * - ZERO AUTHORITY: the notes state it — the composer seeds tasks, it
 *   never dispatches, approves or touches credentials.
 * - Voice is declared-unsupported: the panel renders the pinned
 *   AGENT_TASK_VOICE_UNSUPPORTED_STATEMENT VERBATIM where voice would
 *   be offered (imported from the pins — drift is caught by the mirror
 *   test); voice is never simulated.
 * - The standalone store is labeled BROWSER_PROFILE honestly (the
 *   desktop host binding lands at P13-D).
 */

import type { MissionIntentDirection } from "../console/contracts.js";
import { isTerminalAgentTaskStatusPin, type AgentTaskPin, type AgentTaskStatusPin } from "../lib/agent-task-pins.js";

/* ------------------------- the pinned notes ------------------------- */

/** The panel's zero-authority note (ADR-0007 D7, rendered verbatim). */
export const AGENT_COMPOSER_ZERO_AUTHORITY_NOTE =
  "This composer holds no financial authority: it records requests as resumable tasks. It never dispatches money, never approves anything and never touches credentials — dispatch follows validation, preview and an explicit scoped authorization outside this composer." as const;

/**
 * The honest tools note (the work-order law: expose only tools the
 * authenticated session is allowed to use — in this deployment the
 * session plane is not wired, so NO tools are exposed).
 */
export const AGENT_COMPOSER_NO_TOOLS_NOTE =
  "No tools are exposed: the session plane is not wired in this deployment, so there is no authenticated session with allowed tools. The composer routes typed requests to the task system and states what it cannot do." as const;

/** The honest durability fact for the standalone BROWSER_PROFILE store. */
export const AGENT_COMPOSER_DURABILITY_FACT =
  "Tasks and this conversation are stored in this browser profile only — they survive reloads and reopen with their history, are not synced anywhere, and clearing site data removes them. The desktop host store lands with the desktop integration." as const;

/** The honest fact when UI-state persistence is unavailable (memory-only). */
export const AGENT_COMPOSER_MEMORY_ONLY_FACT =
  "This conversation could not be persisted — storage is unavailable here, so it stays for this view only. Task records persist only where the task store can bind storage; nothing is silently invented in between." as const;

/** The honest line for an empty transcript (nothing asked yet). */
export const AGENT_COMPOSER_EMPTY_TRANSCRIPT_NOTE =
  "Nothing has been asked in this conversation yet. Type a request below — for example \u201cconnect Stripe\u201d or \u201cpay the supplier\u201d." as const;

/** The keyboard hint under the input (predictable, never a surprise send). */
export const AGENT_COMPOSER_INPUT_HINT = "Enter sends · Shift+Enter adds a line" as const;

/* --------------------------- status views --------------------------- */

/** The pill tone vocabulary the composer reuses from the ps- system. */
export type AgentComposerTone = "ok" | "attention" | "unknown" | "disabled";

/** People-language status labels (honest per-status wording). */
const STATUS_VIEW: Readonly<Record<AgentTaskStatusPin, { readonly tone: AgentComposerTone; readonly label: string }>> = {
  DRAFT: { tone: "attention", label: "Draft — a request, nothing more" },
  ACTIVE: { tone: "ok", label: "Active" },
  AWAITING_EXTERNAL_RETURN: {
    tone: "unknown",
    label: "Awaiting an external return — not connected, not confirmed",
  },
  PAUSED: { tone: "attention", label: "Paused — resumable" },
  COMPLETED: { tone: "ok", label: "Completed" },
  FAILED: { tone: "disabled", label: "Failed" },
  CANCELLED: { tone: "disabled", label: "Cancelled" },
  EXPIRED: { tone: "disabled", label: "Expired" },
};

/** The pill projection for one task status. */
export function agentTaskStatusView(status: AgentTaskStatusPin): { tone: AgentComposerTone; label: string } {
  return STATUS_VIEW[status];
}

/* ---------------------------- task views ---------------------------- */

/** One projected task card (the history/progress projection). */
export interface AgentComposerTaskView {
  readonly id: string;
  /** People-language title (intent projected, never raw ids). */
  readonly title: string;
  /** One-line intent summary (direction or provider+form+use case). */
  readonly intentLine: string;
  readonly status: AgentTaskStatusPin;
  readonly statusView: { readonly tone: AgentComposerTone; readonly label: string };
  readonly updatedAt: string;
  readonly createdAt: string;
  /** Is the task still resumable (non-terminal)? */
  readonly resumable: boolean;
  /** The append-only event timeline, oldest first (as recorded). */
  readonly events: readonly { readonly id: string; readonly at: string; readonly kind: string; readonly summary: string }[];
}

/** The people-language direction labels (the pinned mission vocabulary). */
const DIRECTION_LABELS: Readonly<Record<MissionIntentDirection, string>> = {
  PAY: "Pay",
  RECEIVE: "Receive",
  MOVE: "Move",
  CONVERT: "Convert",
};

/** Project a task's intent into a people-language title + summary line. */
export function agentTaskIntentLines(task: AgentTaskPin): { title: string; intentLine: string } {
  if (task.intent.kind === "CONNECTION_SETUP") {
    const provider = task.intent.providerId;
    const form = task.intent.form;
    const useCase = task.intent.useCaseRef ?? "setup";
    return {
      title: `${providerLabel(provider)} setup — ${useCaseLabel(useCase)}`,
      intentLine: `Connection setup · ${provider} · ${form}`,
    };
  }
  return {
    title: `${DIRECTION_LABELS[task.intent.direction]} request`,
    intentLine: `Payment mission · ${DIRECTION_LABELS[task.intent.direction]}`,
  };
}

/** Provider ids are opaque registry ids — render them honestly titled. */
function providerLabel(providerId: string): string {
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

/** The registry use-case refs, in people language (honest, no invention). */
function useCaseLabel(useCaseRef: string): string {
  const KNOWN: Readonly<Record<string, string>> = {
    "own-store-test-mode": "own-store payments (test mode)",
    "existing-account-grant": "existing account grant",
    "marketplace-onboarding": "marketplace onboarding",
  };
  return KNOWN[useCaseRef] ?? useCaseRef;
}

/**
 * Project the task list for the composer: newest-updated first, id
 * ascending as the deterministic tie-break (the overview fold's order
 * law), with per-task status/event projections.
 */
export function projectAgentComposerTasks(
  tasks: readonly AgentTaskPin[],
): readonly AgentComposerTaskView[] {
  return tasks
    .slice()
    .sort(
      (a, b) =>
        (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((task) => {
      const lines = agentTaskIntentLines(task);
      return {
        id: task.id,
        title: lines.title,
        intentLine: lines.intentLine,
        status: task.status,
        statusView: agentTaskStatusView(task.status),
        updatedAt: task.updatedAt,
        createdAt: task.createdAt,
        resumable: !isTerminalAgentTaskStatusPin(task.status),
        events: task.events.map((event) => ({
          id: event.id,
          at: event.at,
          kind: event.kind,
          summary: event.summary,
        })),
      };
    });
}

/** Count the resumable (non-terminal) tasks — the dock badge number. */
export function countResumableAgentTasks(tasks: readonly AgentTaskPin[]): number {
  return tasks.filter((task) => !isTerminalAgentTaskStatusPin(task.status)).length;
}

/* ------------------------ transcript entry views --------------------- */

/** Who a transcript line speaks for (rendered as a speaker label). */
export type AgentComposerSpeaker = "you" | "agent" | "system";

/** Project a transcript entry kind into its speaker + honest line. */
export function agentComposerSpeaker(kind: string): AgentComposerSpeaker {
  if (kind === "USER_TEXT") {
    return "you";
  }
  if (kind === "SURFACE_ACTION" || kind === "COMPOSER_ERROR") {
    return "system";
  }
  return "agent";
}
