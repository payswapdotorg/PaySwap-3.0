/**
 * @payswap/app — the STAGE-PROGRESS PROJECTION (P21-B, ADR-0014 D3).
 *
 * The PURE per-mission stage checklist DERIVED from persisted typed
 * events (the app task's event log) + the mission timeline the channel
 * reads + the deterministic engine view — following the substrate
 * status-panel plan pattern: a DERIVED projection, never a parallel
 * state model, never a static checklist.
 *
 * THE PROJECTION LAW (D3): a stage COMPLETES only from its typed
 * service result — ROUTINE_PINNED (stage 0), the mission's VALIDATED
 * event (stage 1), the deterministic engine view (stages 2-7),
 * PREVIEW_PRESENTED (stage 8), the authority-surface events (9a/10),
 * WAIT_STARTED (9b). Prose never completes anything; the deterministic
 * engines are the only writers. An event-less mission projects every
 * stage PENDING with its prerequisites.
 *
 * ZERO FINANCIAL AUTHORITY: the projection reads records only; it never
 * dispatches, authorizes or observes. PURE: deterministic over its
 * inputs (identical inputs → identical rows — the rehydration law).
 */

import type { RoutePlanningEngineView, RoutePlanningRoutinePin } from "./routePlanningPins.js";
import { parseRoutinePinSummary } from "./routineStagePinning.js";
import { projectRoutePlanningProceedSelection } from "./routePlanningSession.js";
import {
  AGENT_ROUTINE_STAGES_PIN,
  type AgentRoutineStageIdPin,
  type AgentTaskStageProgressPin,
  type AgentTaskStageStatusPin,
} from "./routineStagePins.js";

/* ------------------------------ the inputs ---------------------------- */

/** One mission-timeline event as the channel reads it (the pinned wire shape). */
export interface RoutineStageMissionEventPin {
  readonly kind: string;
  readonly summary: string;
  readonly at: string;
}

/**
 * The mission facts the channel reads supply (the mission-tier inputs;
 * null when NO mission plane is bound — the honest unbound tier).
 */
export interface RoutineStageMissionFacts {
  readonly missionId: string;
  readonly missionStatus: string;
  readonly events: readonly RoutineStageMissionEventPin[];
}

/** One app-task event as the projection reads it. */
export interface RoutineStageTaskEventPin {
  readonly kind: string;
  readonly summary: string;
  readonly at: string;
}

/** The projection's pure inputs. */
export interface RoutineStageProjectionInput {
  /** The app task's persisted events (the journey's session record). */
  readonly taskEvents: readonly RoutineStageTaskEventPin[];
  /** The mission timeline + status (null = the unbound mission tier). */
  readonly mission: RoutineStageMissionFacts | null;
  /** The deterministic engine view (null = no engine presented). */
  readonly engineView: RoutePlanningEngineView | null;
  /** The task's current status (drives the wait stage's in-progress fact). */
  readonly taskStatus?: string;
}

/**
 * The OPTIONAL mission-facts read a real engine adapter may expose (the
 * mission timeline the channel reads — the desktop composition's engine
 * implements this over its mission cache; the app's unbound engine does
 * not, and the stage panel then renders the honest unbound note).
 */
export interface RoutePlanningMissionFactsSource {
  /** The mission's typed timeline facts, or null when unknown. */
  missionFacts(missionId: string): RoutineStageMissionFacts | null;
}

/* ------------------------------ the helpers --------------------------- */

const PENDING_SUMMARY = "Has not run yet — no typed result exists for this stage." as const;

function row(
  stageId: AgentRoutineStageIdPin,
  status: AgentTaskStageStatusPin,
  summary: string,
): AgentTaskStageProgressPin {
  const declaration = AGENT_ROUTINE_STAGES_PIN.find((stage) => stage.stageId === stageId)!;
  return {
    stageId,
    title: declaration.title,
    status,
    summary,
    prerequisites: declaration.prerequisites,
    checkpoint: declaration.checkpoint,
    advisory: declaration.advisory,
  };
}

function hasKind(
  events: readonly { readonly kind: string }[],
  kind: string,
): boolean {
  return events.some((event) => event.kind === kind);
}

/** The pinned routine facts from the LAST ROUTINE_PINNED event (null when none). */
function pinnedRoutineOf(
  taskEvents: readonly RoutineStageTaskEventPin[],
): RoutePlanningRoutinePin | null {
  let pinned: RoutePlanningRoutinePin | null = null;
  for (const event of taskEvents) {
    if (event.kind === "ROUTINE_PINNED") {
      pinned = parseRoutinePinSummary(event.summary);
    }
  }
  return pinned;
}

/* --------------------------- the projection --------------------------- */

/**
 * Project the per-mission twelve-stage checklist. PURE and deterministic:
 * identical inputs → identical rows (the rehydration law — the projection
 * rebuilds identically from the re-read records).
 */
export function projectRoutineStageProgress(
  input: RoutineStageProjectionInput,
): readonly AgentTaskStageProgressPin[] {
  const taskEvents = input.taskEvents;
  const missionEvents = input.mission?.events ?? [];
  const view = input.engineView;
  const rows: AgentTaskStageProgressPin[] = [];

  // Stage 0 — Match + load: COMPLETE from the persisted ROUTINE_PINNED
  // event (the routine id + version + skill digest it carries). An
  // event-less record stays PENDING — the typed result is the pin.
  const pinnedRoutine = pinnedRoutineOf(taskEvents);
  if (pinnedRoutine !== null) {
    rows.push(
      row("0", "COMPLETED", `The pinned routine loaded — ROUTINE_PINNED records ${pinnedRoutine.routineId} v${pinnedRoutine.routineVersion} (skill digest ${pinnedRoutine.skillContentDigest}) on the task record.`),
    );
  } else {
    rows.push(row("0", "PENDING", PENDING_SUMMARY));
  }

  // Stage 1 — Validate / clarify: COMPLETE from the mission's VALIDATED
  // event (the compiled typed intent); IN_PROGRESS while the deterministic
  // ask loop runs (MISSING_FIELD_ASKED).
  if (hasKind(missionEvents, "VALIDATED")) {
    rows.push(
      row("1", "COMPLETED", "The nine-field intake compiled a validated typed intent on the mission plane."),
    );
  } else if (hasKind(missionEvents, "MISSING_FIELD_ASKED")) {
    rows.push(
      row("1", "IN_PROGRESS", "The guided intake is asking its missing fields in the fixed order — NEEDS_INPUT gates until the intent compiles."),
    );
  } else {
    rows.push(row("1", "PENDING", PENDING_SUMMARY));
  }

  // Stages 2-7 — the deterministic engine view is the typed result: each
  // stage's own section of the view (never prose, never a claim).
  const stages27: readonly { readonly id: AgentRoutineStageIdPin; readonly summary: string }[] = view === null
    ? []
    : [
        {
          id: "2",
          summary: `The sender rail snapshot derived: ${view.availableNow.senderEligibleRouteIds.length} eligible sender route id(s) on the current evidence.`,
        },
        {
          id: "3",
          summary: `The recipient rail snapshot derived: ${view.availableNow.recipientEligibleRouteIds.length} eligible recipient route id(s) on the current evidence.`,
        },
        {
          id: "4",
          summary: `Route candidates enumerated: ${view.availableNow.ranked.length} scored + ${view.availableNow.notScored.length} retained unscored, with ${view.exclusions.length} typed exclusion(s).`,
        },
        {
          id: "5",
          summary: `Hard gates applied: ${view.availableNow.ranked.length} hard-eligible candidate(s) ranked with transparent metrics; ${view.availableNow.notScored.length} retained unscored (UNKNOWN dimensions kept).`,
        },
        {
          id: "6",
          summary: `The bounded advisory scenario suite explored: ${view.scenarios.outcomes.length} scenario(s), coverage ${view.scenarios.coverage} — advisory, never production evidence.`,
        },
        {
          id: "7",
          summary: `Offer/opportunity discovery ran: the engine proposed wait criteria over ${view.waiting.proposal.families.join(", ")} families with expiry and fallback declared.`,
        },
      ];
  const byId = new Map(stages27.map((stage) => [stage.id as string, stage.summary]));
  for (const stageId of ["2", "3", "4", "5", "6", "7"] as const) {
    const summary = byId.get(stageId);
    rows.push(summary === undefined ? row(stageId, "PENDING", PENDING_SUMMARY) : row(stageId, "COMPLETED", summary));
  }

  // Stage 8 — Present user choices: COMPLETE from PREVIEW_PRESENTED.
  if (hasKind(taskEvents, "PREVIEW_PRESENTED")) {
    rows.push(
      row("8", "COMPLETED", "A PREVIEW_PRESENTED event recorded the distinct available-now vs conditional presentation with the Proceed / Wait choice."),
    );
  } else {
    rows.push(row("8", "PENDING", PENDING_SUMMARY));
  }

  // Stage 9a — Proceed now: COMPLETE only from the authority-surface
  // dispatch events (the mission timeline's ATTEMPT_*); a recorded
  // proceed REQUEST is IN_PROGRESS (the approval is never the app's).
  if (hasKind(missionEvents, "ATTEMPT_STARTED") || hasKind(missionEvents, "ATTEMPT_CONFIRMED") || hasKind(missionEvents, "OUTCOME_UNKNOWN")) {
    rows.push(
      row("9a", "COMPLETED", "The selected graph was approved and dispatched on the authority surface — the dispatch attempt is recorded on the mission timeline."),
    );
  } else {
    const proceedRequest = projectRoutePlanningProceedSelection(
      taskEvents.map((event) => ({ kind: event.kind, summary: event.summary, at: event.at })),
    );
    rows.push(
      proceedRequest !== null
        ? row("9a", "IN_PROGRESS", `A proceed request is recorded for ${proceedRequest.planId} — the fresh scoped approval still belongs to the real authority surface.`)
        : row("9a", "PENDING", PENDING_SUMMARY),
    );
  }

  // Stage 9b — Wait for opportunities: COMPLETE from WAIT_STARTED (the
  // declared durable criteria); IN_PROGRESS while the task stays WAITING.
  if (hasKind(taskEvents, "WAIT_STARTED")) {
    rows.push(
      row("9b", "COMPLETED", "The wait is recorded under explicit criteria with a deadline — re-evaluation happens on fresh evidence and a match never dispatches by itself."),
    );
  } else if (input.taskStatus === "WAITING_FOR_OPPORTUNITIES") {
    rows.push(
      row("9b", "IN_PROGRESS", "The task is waiting for opportunities — nothing dispatches in the meantime."),
    );
  } else {
    rows.push(row("9b", "PENDING", PENDING_SUMMARY));
  }

  // Stage 10 — Reconcile and close: the FINAL-STAGE COMPLETION CONTRACT
  // (the P21-D reviewer-gate, Gap C). The stage completes from EITHER
  // typed closer — RECONCILED (reconciliation closed an AMBIGUOUS
  // attempt with provider evidence: the only closer of an UNKNOWN) OR
  // ATTEMPT_VERIFIED (the authoritative read-back verified a CONFIRMED
  // attempt: the typed persisted verification fact, completed when
  // reconciliation is not needed — no ambiguity ever existed). The
  // COMPLETED summary names WHICH closer landed. IN_PROGRESS names the
  // honest choice that remains once a dispatched attempt exists.
  if (hasKind(missionEvents, "RECONCILED") || hasKind(taskEvents, "RECONCILED")) {
    rows.push(
      row("10", "COMPLETED", "Reconciliation closed the attempt — provider evidence resolved the ambiguous outcome, and the confirmed/failed truth plus the append-only timeline stand as the record."),
    );
  } else if (hasKind(missionEvents, "ATTEMPT_VERIFIED") || hasKind(taskEvents, "ATTEMPT_VERIFIED")) {
    rows.push(
      row("10", "COMPLETED", "The authoritative read-back verification closed the confirmed attempt — the provider's own record agreed with the recorded confirmation, and the typed verification fact stands on the attempt record."),
    );
  } else if (hasKind(missionEvents, "ATTEMPT_STARTED") || hasKind(missionEvents, "OUTCOME_UNKNOWN")) {
    rows.push(
      row("10", "IN_PROGRESS", "A dispatched attempt exists — an ambiguous outcome reconciles; a confirmed attempt closes through the authoritative read-back verification."),
    );
  } else {
    rows.push(row("10", "PENDING", PENDING_SUMMARY));
  }

  return Object.freeze(rows);
}
