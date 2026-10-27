/**
 * @payswap/app — the ROUTINE-STAGE PANEL (P21-B, ADR-0014 D3 UI).
 *
 * The per-mission stage checklist surface: one row per canonical stage
 * (the ONE workflow vocabulary — ./routineStagePins.ts), each row
 * rendering the DERIVED status (the plan-status vocabulary's own
 * words), the grounded summary, the prerequisite line (while pending)
 * and the typed checkpoint (always). The rows are a PURE projection of
 * the props (the substrate status-panel plan pattern — derived, never a
 * parallel state model); the mount (./RoutePlanningMount.tsx) derives
 * them from the persisted typed events + the engine view.
 *
 * HONESTY LAWS: a null projection renders the unbound-mission-tier note
 * VERBATIM (no mission timeline → no stage checklist, never a fake); a
 * PENDING stage renders its prerequisites, never "done"; the advisory
 * stages carry their advisory label. ZERO AUTHORITY: no button here
 * dispatches, approves or captures anything.
 */

import { StatusPill } from "@zcode/ui/payswap";
import {
  ROUTINE_STAGE_PANEL_UNBOUND_NOTE,
  ROUTINE_STAGE_STATUS_LABELS_PIN,
  type AgentTaskStageProgressPin,
  type AgentTaskStageStatusPin,
} from "./routineStagePins.js";

const STATUS_TONES: Readonly<Record<AgentTaskStageStatusPin, "ok" | "attention" | "disabled">> =
  Object.freeze({
    PENDING: "disabled",
    IN_PROGRESS: "attention",
    COMPLETED: "ok",
  });

function RoutineStageRow({ stage }: { readonly stage: AgentTaskStageProgressPin }): React.ReactNode {
  return (
    <li
      className="ps-agent-stage-item"
      data-ps-stage-id={stage.stageId}
      data-ps-stage-status={stage.status}
    >
      <div className="ps-agent-stage-head">
        <p className="ps-agent-stage-title">
          <span className="ps-num ps-agent-stage-id">Stage {stage.stageId}</span> · {stage.title}
          {stage.advisory ? <span className="ps-agent-stage-advisory"> (advisory)</span> : null}
        </p>
        <StatusPill tone={STATUS_TONES[stage.status]}>{ROUTINE_STAGE_STATUS_LABELS_PIN[stage.status]}</StatusPill>
      </div>
      <p className="ps-agent-stage-summary">{stage.summary}</p>
      {stage.status !== "COMPLETED" ? (
        <p className="ps-agent-stage-prereq">Before it can run: {stage.prerequisites}</p>
      ) : null}
      <p className="ps-agent-stage-checkpoint">Completes when: {stage.checkpoint}</p>
    </li>
  );
}

export interface RoutineStagePanelProps {
  /**
   * The derived per-stage rows (./routineStageProjection.ts), or null
   * when the mission tier is not wired (the honest unbound note).
   */
  readonly progress: readonly AgentTaskStageProgressPin[] | null;
}

export function RoutineStagePanel({ progress }: RoutineStagePanelProps): React.ReactNode {
  return (
    <section className="ps-agent-stages" aria-label="Routine stages — the journey's twelve steps">
      <h3 className="ps-agent-stages-title">Routine stages</h3>
      {progress === null ? (
        <p className="ps-agent-stages-note">{ROUTINE_STAGE_PANEL_UNBOUND_NOTE}</p>
      ) : (
        <>
          <p className="ps-agent-stages-note">
            Derived from this mission's typed events and the deterministic engine view — a stage
            completes only from its typed result, never from a claim.
          </p>
          <ol className="ps-agent-stage-list">
            {progress.map((stage) => (
              <RoutineStageRow key={stage.stageId} stage={stage} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
