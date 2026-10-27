/**
 * @payswap/app — the COMPOSER TASK-CLOSE path (P13-A; split from
 * ./agentComposerController.ts for the ≤400-line file law).
 *
 * The CANCEL verb: a task-RECORD orchestration close with ZERO
 * financial authority (ADR-0007 D7 — the composer's one extra verb).
 * The monotonic-terminal law is enforced honestly: a terminal task is
 * refused with the law named, never silently re-opened.
 */

import type { AgentComposerTranscriptEntry } from "./agentComposerUiState.js";
import type { AgentComposerTaskView } from "./agentComposerProjection.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";

/** The controller seams the close path needs (explicit — never globals). */
export interface AgentComposerCloseHost {
  /** The composer's ONE task-session port (the only mutation surface). */
  session(): AgentTaskSessionPort;
  /** The controller's injectable clock (ISO-8601 UTC instants). */
  clock(): string;
  /** Append transcript entries (the controller owns the cap + persistence). */
  appendEntries(entries: readonly { readonly kind: AgentComposerTranscriptEntry["kind"]; readonly text: string; readonly taskId?: string }[], at: string): void;
  /** Persist the UI state (best-effort). */
  persistUi(): void;
  /** Notify the subscribers. */
  emit(): void;
}

/**
 * Cancel a task RECORD through the session port (an orchestration close,
 * never a financial act). The terminal-status refusal surfaces the
 * monotonic-terminal law; every failure is surfaced, never masked.
 */
export async function cancelAgentComposerTask(
  host: AgentComposerCloseHost,
  taskId: string,
  tasks: readonly AgentComposerTaskView[],
): Promise<void> {
  const task = tasks.find((entry) => entry.id === taskId);
  if (task === undefined) {
    return;
  }
  if (!task.resumable) {
    host.appendEntries(
      [
        {
          kind: "COMPOSER_ERROR",
          text: `Task ${taskId} is ${task.status} — a terminal status has no lawful exit (the monotonic-terminal law).`,
        },
      ],
      host.clock(),
    );
    host.persistUi();
    host.emit();
    return;
  }
  try {
    await host.session().updateTaskStatus(
      taskId,
      "CANCELLED",
      "CANCELLED",
      host.clock(),
      "Cancelled from the composer — the task record is closed. Nothing was dispatched: the composer holds no financial authority.",
    );
    host.appendEntries(
      [
        {
          kind: "TASK_CANCELLED",
          text: `Task cancelled: ${task.title}. The record is closed — nothing was dispatched and nothing needs unwinding.`,
          taskId,
        },
      ],
      host.clock(),
    );
  } catch (thrown: unknown) {
    host.appendEntries(
      [
        {
          kind: "COMPOSER_ERROR",
          text: thrown instanceof Error ? thrown.message : String(thrown),
        },
      ],
      host.clock(),
    );
  }
}
