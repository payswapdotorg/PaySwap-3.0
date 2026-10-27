/**
 * @payswap/app — the COMPOSER SEED PATH (P13-A, P21-B; split from
 * ./agentComposerController.ts for the ≤400-line file law).
 *
 * The shared convergence helpers every composer entrypoint funnels
 * through: the ONE seed fold (seedOrResume — text and surface actions
 * converge on the same task, never a duplicate), the task-outcome
 * people-language line, and the honest task-list reload. The controller
 * owns the state; this module owns the path over its host seams.
 */

import type { AgentTaskIntentPin, AgentTaskPin } from "../lib/agent-task-pins.js";
import { projectAgentComposerTasks } from "./agentComposerProjection.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";

/** The controller seams the seed path needs (explicit — never globals). */
export interface AgentComposerSeedHost {
  /** The composer's ONE task-session port (never a second adapter). */
  session(): AgentTaskSessionPort;
  /** The controller's injectable clock (ISO-8601 UTC instants). */
  clock(): string;
  /** Set the projected task list + phase (the controller owns the state). */
  setTasks(tasks: ReturnType<typeof projectAgentComposerTasks>, phase: "ready" | "error", error: string | null): void;
}

/** The outcome of the shared seed fold (CREATED/RESUMED or the typed refusal). */
export type AgentComposerSeedOutcome =
  | { readonly action: "CREATED" | "RESUMED"; readonly task: AgentTaskPin }
  | { readonly action: "REFUSED"; readonly message: string };

/** Create the shared seed-path helpers over the host seams. */
export function createAgentComposerSeedPath(host: AgentComposerSeedHost) {
  /** The shared seed fold — every entrypoint converges here. */
  const seed = async (
    intent: AgentTaskIntentPin,
    origin: "COMPOSER_TEXT" | "SURFACE_ACTION",
    originNote: string,
  ): Promise<AgentComposerSeedOutcome> => {
    try {
      return await host.session().seedOrResume({
        intent,
        origin,
        now: host.clock(),
        originNote,
      });
    } catch (thrown: unknown) {
      const message =
        thrown instanceof Error ? thrown.message : String(thrown ?? "the task store refused the request");
      return { action: "REFUSED", message };
    }
  };

  /** The task-outcome people-language line (the transcript's record). */
  const taskOutcomeLine = (task: AgentTaskPin, action: "CREATED" | "RESUMED"): string => {
    const lines = projectAgentComposerTasks([task])[0]!;
    const verb = action === "CREATED" ? "Task created" : "Task resumed — the same one, not a duplicate";
    return `${verb}: ${lines.title}. Status: ${lines.statusView.label}. This is a request record, not a payment or a connection.`;
  };

  /** The honest task-list reload (loading/error phases surfaced, never masked). */
  const reloadTasks = async (): Promise<void> => {
    try {
      const tasks = await host.session().listTasks();
      host.setTasks(projectAgentComposerTasks(tasks), "ready", null);
    } catch (thrown: unknown) {
      host.setTasks(
        [],
        "error",
        thrown instanceof Error ? thrown.message : String(thrown ?? "the task store could not be read"),
      );
    }
  };

  return { seed, taskOutcomeLine, reloadTasks };
}
