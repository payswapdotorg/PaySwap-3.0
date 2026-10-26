/**
 * @payswap/app — the ROUTE-PLANNING MOUNT (P16-D part 3; gap-matrix D5).
 *
 * The route-planning section inside the composer panel: reads the ONE
 * shared composer controller (the same discipline as the embed mount),
 * finds the newest resumable PAYMENT_MISSION task, asks the injected
 * engine for the presentable view and records PREVIEW_PRESENTED exactly
 * once per view digest. The DEFAULT engine is the fail-closed UNBOUND
 * engine — the live-app truth until the platform host binds the REAL
 * route-planning engines at its composition root (ADR-0009 D2): the
 * mount then renders the honest unbound note, never fabricated data.
 *
 * HONESTY LAWS: no engine → the unbound note; a failed engine → the
 * surfaced error; no payment mission → the honest empty note (route
 * planning starts only from a validated typed intent, never from the
 * composer opening); no session → the choices render as not-wired notes,
 * never as silent no-op buttons. Proceed records a REQUEST and Wait
 * declares criteria — neither dispatches anything, ever.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { sharedAgentComposerController, type AgentComposerController } from "./agentComposerController.js";
import { RoutePlanningPanel } from "./RoutePlanningPanel.js";
import { createRoutePlanningSession, projectRoutePlanningWaiting, type RoutePlanningSession } from "./routePlanningSession.js";
import {
  isRoutePlanningEngineUnbound,
  unboundRoutePlanningEngine,
  type RoutePlanningEnginePort,
  type RoutePlanningPanelView,
  type RoutePlanningWaitCriteriaPin,
} from "./routePlanningPins.js";
import type { AgentComposerTaskView } from "./agentComposerProjection.js";

/* ------------- the shared engine binding (the composition seam) ------------- */

let sharedEngine: RoutePlanningEnginePort | undefined;
/** The ONE fail-closed unbound engine instance (stable identity — the live-app default). */
const UNBOUND_ENGINE: RoutePlanningEnginePort = unboundRoutePlanningEngine();

/** The ONE shared route-planning engine per document (default: the honest UNBOUND engine). */
export function sharedRoutePlanningEngine(): RoutePlanningEnginePort {
  return sharedEngine ?? UNBOUND_ENGINE;
}

/** The composition-root binding (the platform host / the acceptance tests). */
export function bindRoutePlanningEngine(engine: RoutePlanningEnginePort): void {
  sharedEngine = engine;
}

/** Test/inspection helper: drop the shared binding (never used in src). */
export function resetSharedRoutePlanningEngine(): void {
  sharedEngine = undefined;
}

/* --------------------------------- the mount --------------------------------- */

export interface RoutePlanningMountProps {
  /** Injectable controller (tests); default: the ONE shared controller. */
  readonly controller?: AgentComposerController;
  /** Injectable engine; default: the shared binding (the honest UNBOUND engine). */
  readonly engine?: RoutePlanningEnginePort;
  /** Injectable session; when absent the choices render as not-wired notes. */
  readonly session?: RoutePlanningSession;
}

/** The newest-updated resumable payment-mission task (or undefined — honestly). */
function latestPaymentMissionTask(tasks: readonly AgentComposerTaskView[]): AgentComposerTaskView | undefined {
  return tasks.find((task) => task.resumable && task.intentLine.startsWith("Payment mission"));
}

export function RoutePlanningMount({
  controller,
  engine,
  session,
}: RoutePlanningMountProps): React.ReactNode {
  const resolvedController = controller ?? sharedAgentComposerController();
  const state = useSyncExternalStore(
    resolvedController.subscribe,
    resolvedController.getState,
    resolvedController.getState,
  );
  const resolvedEngine = engine ?? sharedRoutePlanningEngine();
  const [view, setView] = useState<RoutePlanningPanelView | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const recordedDigest = useRef<string | null>(null);

  const missionTask = latestPaymentMissionTask(state.tasks);
  const taskId = missionTask?.id;

  // Ask the engine for the presentable view; record the preview exactly
  // once per view digest. The unbound engine fails closed → the honest
  // unbound note; a failed engine → the surfaced error, never masked.
  useEffect(() => {
    if (taskId === undefined) {
      setView(null);
      return;
    }
    try {
      const engineView = resolvedEngine.presentableView({ taskRef: taskId });
      if (session !== undefined && recordedDigest.current !== engineView.viewDigest) {
        recordedDigest.current = engineView.viewDigest;
        void session
          .presentChoices(taskId, engineView)
          .then(() => resolvedController.refresh())
          .catch(() => {
            /* surfaced through the task list's honest phases, never masked */
          });
      }
      setView({ kind: "PRESENTED_PLAN", view: engineView });
    } catch (thrown: unknown) {
      setView(
        isRoutePlanningEngineUnbound(thrown)
          ? { kind: "UNBOUND_ENGINE" }
          : { kind: "ENGINE_ERROR", message: thrown instanceof Error ? thrown.message : String(thrown) },
      );
    }
  }, [taskId, resolvedEngine, session, resolvedController]);

  if (state.tasksPhase === "loading") {
    return (
      <section className="ps-agent-route" aria-label="Route planning — proceed or wait">
        <h3 className="ps-agent-route-title">Route planning — proceed or wait</h3>
        <p className="ps-agent-route-empty" role="status">
          Loading tasks…
        </p>
      </section>
    );
  }
  if (missionTask === undefined) {
    return (
      <section className="ps-agent-route" aria-label="Route planning — proceed or wait">
        <h3 className="ps-agent-route-title">Route planning — proceed or wait</h3>
        <p className="ps-agent-route-empty">
          No payment mission to plan yet — a Pay, Move or Convert request seeds one. Route planning starts only from a
          validated typed intent, never from opening this composer.
        </p>
      </section>
    );
  }

  const waiting = projectRoutePlanningWaiting(missionTask.status, missionTask.events);
  const runChoice = (call: () => Promise<unknown>): void => {
    setChoiceError(null);
    call()
      .then(() => resolvedController.refresh())
      .catch((thrown: unknown) => {
        setChoiceError(thrown instanceof Error ? thrown.message : String(thrown));
      });
  };
  const onProceed =
    session !== undefined && taskId !== undefined
      ? (planId: string) => runChoice(() => session.chooseProceed(taskId, planId))
      : undefined;
  const onChooseWait =
    session !== undefined && taskId !== undefined
      ? (criteria: RoutePlanningWaitCriteriaPin) => runChoice(() => session.chooseWait(taskId, criteria))
      : undefined;
  const onCancelWait =
    session !== undefined && taskId !== undefined && waiting.status === "WAITING_FOR_OPPORTUNITIES"
      ? () => runChoice(() => session.cancelWait(taskId))
      : undefined;

  return (
    <>
      <RoutePlanningPanel
        view={view ?? { kind: "UNBOUND_ENGINE" }}
        waiting={waiting}
        onProceed={onProceed}
        onChooseWait={onChooseWait}
        onCancelWait={onCancelWait}
      />
      {choiceError !== null ? (
        <p className="ps-agent-route-note ps-agent-route-note--error" role="alert">
          The choice was refused: {choiceError}
        </p>
      ) : null}
    </>
  );
}
