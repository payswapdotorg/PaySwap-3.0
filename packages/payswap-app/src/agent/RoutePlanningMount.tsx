/**
 * @payswap/app — the ROUTE-PLANNING MOUNT (P16-D part 3; gap-matrix D5;
 * the P17-B composition seams — ADR-0010 D5).
 *
 * The route-planning section inside the composer panel: reads the ONE
 * shared composer controller (the same discipline as the embed mount),
 * finds the newest resumable PAYMENT_MISSION task, asks the injected
 * engine for the presentable view and records PREVIEW_PRESENTED exactly
 * once per view digest. The DEFAULT engine is the fail-closed UNBOUND
 * engine — the live-app truth until the platform host binds the REAL
 * route-planning engines at its composition root (ADR-0009 D2): the
 * mount then renders the honest unbound note, never fabricated data.
 * The composition root (the platform host / the acceptance tests) binds
 * BOTH the engine (bindRoutePlanningEngine) and the session
 * (bindRoutePlanningSession — P17-B, mirroring the engine seam); the
 * defaults remain the honest UNBOUND engine and NO session → the
 * unbound note + the not-wired choice notes.
 *
 * HONESTY LAWS: no engine → the unbound note; a failed engine → the
 * surfaced error; no validated intent → the honest NO_VALIDATED_INTENT
 * note (the engine's typed no-mission outcome is an EMPTY state, never
 * an error mask); no payment mission → the honest empty note (route
 * planning starts only from a validated typed intent, never from the
 * composer opening); no session → the choices render as not-wired notes,
 * never as silent no-op buttons. Proceed records a REQUEST and Wait
 * declares criteria — neither dispatches anything, ever.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { sharedAgentComposerController, type AgentComposerController } from "./agentComposerController.js";
import { RoutePlanningPanel } from "./RoutePlanningPanel.js";
import { RoutineStagePanel } from "./RoutineStagePanel.js";
import {
  projectRoutineStageProgress,
  type RoutineStageMissionFacts,
  type RoutePlanningMissionFactsSource,
} from "./routineStageProjection.js";
import { recordRoutinePin } from "./routineStagePinning.js";
import { projectRoutePlanningWaiting, type RoutePlanningSession } from "./routePlanningSession.js";
import {
  isRoutePlanningEngineUnbound,
  isRoutePlanningNoIntentError,
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

/* ------------- the shared session binding (the composition seam) ------------- */

let sharedSession: RoutePlanningSession | undefined;

/** The ONE shared route-planning session per document (default: undefined — the honest not-wired notes). */
export function sharedRoutePlanningSession(): RoutePlanningSession | undefined {
  return sharedSession;
}

/** The composition-root session binding (the platform host / the acceptance tests bind BOTH seams). */
export function bindRoutePlanningSession(session: RoutePlanningSession): void {
  sharedSession = session;
}

/** Test/inspection helper: drop the shared session binding (never used in src). */
export function resetSharedRoutePlanningSession(): void {
  sharedSession = undefined;
}

/* --------------------------------- the mount --------------------------------- */

export interface RoutePlanningMountProps {
  /** Injectable controller (tests); default: the ONE shared controller. */
  readonly controller?: AgentComposerController;
  /** Injectable engine; default: the shared binding (the honest UNBOUND engine). */
  readonly engine?: RoutePlanningEnginePort;
  /** Injectable session; default: the shared binding (absent → the honest not-wired notes). */
  readonly session?: RoutePlanningSession;
}

/** The newest-updated resumable payment-mission task (or undefined — honestly). */
function latestPaymentMissionTask(tasks: readonly AgentComposerTaskView[]): AgentComposerTaskView | undefined {
  return tasks.find((task) => task.resumable && task.intentLine.startsWith("Payment mission"));
}

/** The task↔mission link re-derived from the PROJECTED task view's events
 * (the persisted link — correlationRef on the link-bearing kinds). */
function missionLinkOfView(task: AgentComposerTaskView | undefined): string | undefined {
  if (task === undefined) {
    return undefined;
  }
  let missionId: string | undefined;
  for (const event of task.events) {
    if ((event.kind === "MISSING_FIELD_ASKED" || event.kind === "FIELD_CAPTURED") && event.correlationRef !== undefined) {
      missionId = event.correlationRef;
    }
  }
  return missionId;
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
  const resolvedSession = session ?? sharedRoutePlanningSession();
  const [view, setView] = useState<RoutePlanningPanelView | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const recordedDigest = useRef<string | null>(null);

  const missionTask = latestPaymentMissionTask(state.tasks);
  const taskId = missionTask?.id;

  // Ask the engine for the presentable view; record the preview exactly
  // once per view digest. The unbound engine fails closed → the honest
  // unbound note; a typed no-validated-intent outcome → the honest empty
  // state (never an error mask); a failed engine → the surfaced error.
  useEffect(() => {
    if (taskId === undefined) {
      setView(null);
      return;
    }
    try {
      const engineView = resolvedEngine.presentableView({ taskRef: taskId });
      // (P21-B, D3) Stage 0's typed result: the ROUTINE_PINNED event lands
      // in the app task store when the routine loads (the pinned facts the
      // engine view carries — routineId + version + skill digest). The pin
      // instant is the engine's OWN evaluation instant (DATA — never an
      // ambient clock read).
      void recordRoutinePin(resolvedController.sessionPort(), taskId, engineView.routine, engineView.presentedAt)
        .then(() => resolvedController.refresh())
        .catch(() => {
          /* the pin's typed drift/refusal surfaces through the task record, never masked */
        });
      if (resolvedSession !== undefined && recordedDigest.current !== engineView.viewDigest) {
        recordedDigest.current = engineView.viewDigest;
        void resolvedSession
          .presentChoices(taskId, engineView)
          .then(() => resolvedController.refresh())
          .catch(() => {
            /* surfaced through the task list's honest phases, never masked */
          });
      }
      setView({ kind: "PRESENTED_PLAN", view: engineView });
    } catch (thrown: unknown) {
      setView(
        isRoutePlanningNoIntentError(thrown)
          ? { kind: "NO_VALIDATED_INTENT" }
          : isRoutePlanningEngineUnbound(thrown)
            ? { kind: "UNBOUND_ENGINE" }
            : { kind: "ENGINE_ERROR", message: thrown instanceof Error ? thrown.message : String(thrown) },
      );
    }
  }, [taskId, resolvedEngine, resolvedSession, resolvedController]);

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

  // (P21-B, D3) The stage-checklist projection inputs: the mission
  // timeline (the engine's mission-facts read — bound only where a real
  // mission plane exists) + the task's persisted events + the engine
  // view. NO mission timeline → the honest unbound note, never a fake.
  const factsSource = resolvedEngine as Partial<RoutePlanningMissionFactsSource>;
  const missionId = missionLinkOfView(missionTask) ?? state.missionIntake.missionId;
  const missionFacts: RoutineStageMissionFacts | null =
    missionId !== undefined && typeof factsSource.missionFacts === "function"
      ? factsSource.missionFacts(missionId)
      : null;
  const stageProgress = projectRoutineStageProgress({
    taskEvents: missionTask.events,
    mission: missionFacts,
    engineView: view?.kind === "PRESENTED_PLAN" ? view.view : null,
    taskStatus: missionTask.status,
  });

  const runChoice = (call: () => Promise<unknown>): void => {
    setChoiceError(null);
    call()
      .then(() => resolvedController.refresh())
      .catch((thrown: unknown) => {
        setChoiceError(thrown instanceof Error ? thrown.message : String(thrown));
      });
  };
  const onProceed =
    resolvedSession !== undefined && taskId !== undefined
      ? (planId: string) => runChoice(() => resolvedSession.chooseProceed(taskId, planId))
      : undefined;
  const onChooseWait =
    resolvedSession !== undefined && taskId !== undefined
      ? (criteria: RoutePlanningWaitCriteriaPin) => runChoice(() => resolvedSession.chooseWait(taskId, criteria))
      : undefined;
  const onCancelWait =
    resolvedSession !== undefined && taskId !== undefined && waiting.status === "WAITING_FOR_OPPORTUNITIES"
      ? () => runChoice(() => resolvedSession.cancelWait(taskId))
      : undefined;

  return (
    <>
      <RoutineStagePanel progress={missionFacts === null ? null : stageProgress} />
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
