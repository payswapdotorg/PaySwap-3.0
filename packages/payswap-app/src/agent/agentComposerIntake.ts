/**
 * @payswap/app — the COMPOSER↔MISSION INTAKE WIRING (P21-B, ADR-0014
 * D2; split from ./agentComposerController.ts for the ≤400-line file
 * law).
 *
 * The controller-side half of the mission-intake binding: resolves the
 * MissionIntakeBinding lazily over the injected plane (the option for
 * tests; the SHARED plane binding for platform hosts — see
 * ./agentComposerShared.ts), routes the send-path ask ownership and the
 * post-seed mission attachment through it, and surfaces the honest
 * UNBOUND note when no plane is bound. The binding itself (the state
 * machine) lives in ./missionIntakeBinding.ts; this module owns only
 * the controller's wiring around it.
 */

import type { AgentTaskPin } from "../lib/agent-task-pins.js";
import { sharedMissionIntakePlane } from "./agentComposerShared.js";
import {
  createMissionIntakeBinding,
  type MissionIntakeBinding,
  type MissionIntakeEmitEntry,
} from "./missionIntakeBinding.js";
import { MISSION_INTAKE_UNBOUND_NOTE } from "./missionIntakePins.js";
import type { MissionIntakePlanePort, MissionIntakeState } from "./missionIntakePins.js";
import type { AgentTaskSessionPort } from "./taskSessionPort.js";

/** The controller seams the wiring needs (explicit — never globals). */
export interface AgentComposerIntakeHost {
  /** The composer's ONE task-session port (never a second adapter). */
  session(): AgentTaskSessionPort;
  /** The controller's injectable clock (ISO-8601 UTC instants). */
  clock(): string;
  /** Append transcript entries (the controller owns the cap + persistence). */
  appendEntries(entries: readonly MissionIntakeEmitEntry[], at: string): void;
  /** Persist the UI state (best-effort — the controller's downgrade law). */
  persistUi(): void;
  /** Notify the subscribers (a state change landed). */
  emit(): void;
  /** Set the projected mission-intake state on the composer state. */
  setMissionIntake(next: MissionIntakeState): void;
}

/** The wiring the controller consumes. */
export interface AgentComposerIntakeWiring {
  /** The resolved binding (undefined when no plane is bound — the honest unbound tier). */
  resolve(): MissionIntakeBinding | undefined;
  /** The send-path ask ownership: true when the text was consumed as an intake answer. */
  handleSendText(text: string): Promise<boolean>;
  /** Post-seed mission attachment (binds the plane, or discloses the honest unbound tier). */
  attachForSeed(task: AgentTaskPin): Promise<void>;
  /** The reload path: re-derive the task↔mission link from the persisted events. */
  resume(task: AgentTaskPin): Promise<void>;
}

/**
 * Create the intake wiring over the plane (the injected option wins; the
 * shared host binding is the fallback — both absent = the honest unbound
 * tier, never a faked mission).
 */
export function createAgentComposerIntakeWiring(
  plane: MissionIntakePlanePort | undefined,
  host: AgentComposerIntakeHost,
): AgentComposerIntakeWiring {
  let binding: MissionIntakeBinding | undefined;
  const resolve = (): MissionIntakeBinding | undefined => {
    if (plane === undefined) {
      return undefined;
    }
    binding ??= createMissionIntakeBinding({
      plane,
      session: host.session(),
      clock: host.clock,
      emit: (entries) => {
        host.appendEntries(entries, host.clock());
        host.persistUi();
        host.emit();
      },
      notify: () => {
        host.setMissionIntake(binding?.state() ?? { phase: "UNBOUND" });
        host.emit();
      },
    });
    return binding;
  };
  return {
    resolve,
    async handleSendText(text) {
      const intake = resolve();
      return intake !== undefined && (await intake.handleSendText(text));
    },
    async resume(task) {
      const intake = resolve();
      if (intake !== undefined) {
        await intake.resume(task);
      }
    },
    async attachForSeed(task) {
      if (task.intent.kind !== "PAYMENT_MISSION") {
        return;
      }
      const intake = resolve();
      if (intake !== undefined) {
        await intake.attachTask(task);
        return;
      }
      host.appendEntries([{ kind: "AGENT_REPLY", text: MISSION_INTAKE_UNBOUND_NOTE, taskId: task.id }], host.clock());
    },
  };
}

/** Resolve the plane a controller instance binds (option → shared host binding). */
export function resolveControllerIntakePlane(
  injected: MissionIntakePlanePort | undefined,
): MissionIntakePlanePort | undefined {
  return injected ?? sharedMissionIntakePlane();
}
