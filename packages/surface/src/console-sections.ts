/**
 * @payswap/surface — the workspace section folds (P10-A, §6).
 *
 * NET-NEW module implementing the §6 section fold laws as pure
 * functions with honest empty states (SV-8: typed reason + real next
 * action, never a failure tone, never a dead action): the overview fold
 * (in-progress missions, the honest approvals-plane attention line,
 * capped reverse-chronological recent events, the designed-empty
 * contract) and the per-section empty-state reason vocabulary.
 *
 * LAWS enforced here (canonical):
 * - Pure and deterministic: same input, same view; no ambient
 *   clock/locale/registry; `now`-free (the folds read only the records'
 *   explicit ISO-8601 timestamps).
 * - Fail-closed: a structurally malformed record (store-assigned
 *   structure) throws the typed InvalidConsoleMissionError — never a
 *   silently degraded view.
 * - The attention line is the honest approvals-plane fact, carried
 *   VERBATIM from the §4 APPROVAL prerequisite family; its route is the
 *   approvals section.
 * - Recent events are REAL mission events (reverse-chronological, capped
 *   at 20, each tagged with its mission id) — never invented activity.
 * - The designed-empty state appears exactly when no in-progress mission
 *   exists, with the create-first-mission next action that WORKS (§5
 *   store: the missions section hosts the intake).
 */

import { MISSION_PREREQUISITE_APPROVAL } from "./console-ladder.ts";
import {
  InvalidConsoleMissionError,
  missionSummaryOf,
  validateMissionRecordShape,
  type MissionEvent,
  type MissionRecord,
  type MissionSummary,
} from "./console-missions.ts";
import type { ConsoleSectionId } from "./console-workspace.ts";

/** The recent-events cap on the overview fold (§6). */
export const WORKSPACE_OVERVIEW_RECENT_EVENTS_CAP = 20 as const;

/** One mission event tagged with the mission that recorded it. */
export interface TaggedMissionEvent {
  readonly missionId: string;
  readonly event: MissionEvent;
}

/** The honest approvals-plane attention line (reason verbatim from §4 APPROVAL). */
export interface WorkspaceOverviewAttention {
  readonly reason: string;
  /** The console section route that carries the approvals plane. */
  readonly route: "approvals";
}

/** The designed-empty contract (typed reason + working next action). */
export interface WorkspaceEmptyState {
  readonly reason: string;
  readonly nextAction: { readonly kind: "route"; readonly value: string; readonly label: string };
}

/** The overview fold result (§6 overview). */
export interface WorkspaceOverviewView {
  /** In-progress missions (status !== "ARCHIVED"), newest-updated first. */
  readonly inProgress: readonly MissionSummary[];
  /** The honest approvals-plane fact + its route. */
  readonly attention: WorkspaceOverviewAttention;
  /** Real mission events, reverse-chronological, capped at 20, mission-tagged. */
  readonly recentEvents: readonly TaggedMissionEvent[];
  /** null iff inProgress is non-empty; the designed-empty contract otherwise. */
  readonly emptyState: WorkspaceEmptyState | null;
}

const OVERVIEW_EMPTY_NO_MISSIONS =
  "No missions exist yet — the workspace holds demand-side intent only, and none has been recorded." as const;
const OVERVIEW_EMPTY_ALL_ARCHIVED =
  "No in-progress missions — every recorded mission is archived." as const;
const CREATE_FIRST_MISSION = {
  kind: "route",
  value: "/console/missions",
  label: "Create the first mission",
} as const;

/** Plain code-unit string compare (deterministic; no ambient locale). */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Fold the workspace overview (§6): in-progress missions (status !==
 * "ARCHIVED", newest-updated first — id ascending as the deterministic
 * tie-break), the honest approvals-plane attention line, recent events
 * from ALL records (reverse-chronological by `at`, then mission id and
 * event id ascending as deterministic tie-breaks, capped at 20), and
 * the designed-empty contract exactly when no in-progress mission
 * exists. Pure, deterministic, fail-closed.
 */
export function foldWorkspaceOverview(records: readonly MissionRecord[]): WorkspaceOverviewView {
  for (const [index, record] of records.entries()) {
    try {
      validateMissionRecordShape(record);
    } catch (error) {
      throw new InvalidOverviewRecordError(
        `records[${index}]: ${(error as Error).message} — malformed records are quarantined by the store, never rendered`,
      );
    }
  }

  const inProgress = records
    .filter((record) => record.status !== "ARCHIVED")
    .map((record) => missionSummaryOf(record))
    .sort((a, b) => -compareStrings(a.updatedAt, b.updatedAt) || compareStrings(a.id, b.id));

  const recentEvents = records
    .flatMap((record) => record.events.map((event) => ({ missionId: record.id, event })))
    .sort(
      (a, b) =>
        -compareStrings(a.event.at, b.event.at) ||
        compareStrings(a.missionId, b.missionId) ||
        compareStrings(a.event.id, b.event.id),
    )
    .slice(0, WORKSPACE_OVERVIEW_RECENT_EVENTS_CAP);

  const emptyState: WorkspaceEmptyState | null =
    inProgress.length > 0
      ? null
      : {
          reason: records.length === 0 ? OVERVIEW_EMPTY_NO_MISSIONS : OVERVIEW_EMPTY_ALL_ARCHIVED,
          nextAction: CREATE_FIRST_MISSION,
        };

  return {
    inProgress,
    attention: { reason: MISSION_PREREQUISITE_APPROVAL, route: "approvals" },
    recentEvents,
    emptyState,
  };
}

/** Raised when an overview input record is malformed (fail-closed; a console mission error). */
export class InvalidOverviewRecordError extends InvalidConsoleMissionError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOverviewRecordError";
  }
}

/* ====================================================================
 * Section empty-state reason vocabulary (§6)
 * ==================================================================== */

/** Typed designed-empty reason ids (one per §6 section that has one). */
export type ConsoleSectionEmptyReasonId =
  | "OVERVIEW_NO_MISSIONS"
  | "MISSIONS_NONE_RECORDED"
  | "NO_AGENT_REGISTRY"
  | "NO_APPROVAL_PLANE"
  | "NO_CONNECTED_CAPABILITIES"
  | "NO_RECORDED_EVENTS"
  | "NO_EXPERIMENTS";

/** One section's designed-empty contract (typed reason + next action). */
export interface ConsoleSectionEmptyState {
  readonly sectionId: ConsoleSectionId;
  readonly reasonId: ConsoleSectionEmptyReasonId;
  /** Why the section renders empty — a designed-empty fact, never a failure tone. */
  readonly reason: string;
  /** The real next action; null when no in-workspace action exists by design. */
  readonly nextAction: { readonly kind: "route"; readonly value: string; readonly label: string } | null;
}

const SECTION_EMPTY_STATES: readonly ConsoleSectionEmptyState[] = Object.freeze([
  {
    sectionId: "overview",
    reasonId: "OVERVIEW_NO_MISSIONS",
    reason: OVERVIEW_EMPTY_NO_MISSIONS,
    nextAction: CREATE_FIRST_MISSION,
  },
  {
    sectionId: "missions",
    reasonId: "MISSIONS_NONE_RECORDED",
    reason:
      "No missions recorded yet — missions are demand-side intent, recorded through the creation intake in this section.",
    nextAction: CREATE_FIRST_MISSION,
  },
  {
    sectionId: "agents",
    reasonId: "NO_AGENT_REGISTRY",
    reason:
      "No agent registry exists in this deployment — agents cannot be listed or minted here; the agent-contract vocabulary below is reference, never registered agents.",
    nextAction: null,
  },
  {
    sectionId: "approvals",
    reasonId: "NO_APPROVAL_PLANE",
    reason:
      "No approval plane is configured — there is nothing to approve and nothing approved; no approval can be minted from this workspace.",
    nextAction: null,
  },
  {
    sectionId: "connections",
    reasonId: "NO_CONNECTED_CAPABILITIES",
    reason:
      "No connected capabilities — zero connections exist on recorded evidence (NO_EVIDENCE_COVERAGE); setup-required states carry their route to resolve.",
    nextAction: { kind: "route", value: "/app/connections", label: "Go to Connections" },
  },
  {
    sectionId: "activity",
    reasonId: "NO_RECORDED_EVENTS",
    reason:
      "No mission events recorded yet — activity rows come from real mission events, never from the UI.",
    nextAction: CREATE_FIRST_MISSION,
  },
  {
    sectionId: "lab",
    reasonId: "NO_EXPERIMENTS",
    reason:
      "No experiments exist — the Lab's simulations are advisory/test evidence only, never production financial authority.",
    nextAction: null,
  },
] as const);

/** The §6 designed-empty contracts (seven sections; settings has none by design). */
export const CONSOLE_SECTION_EMPTY_STATES: readonly ConsoleSectionEmptyState[] =
  SECTION_EMPTY_STATES;

/**
 * The designed-empty contract for one section, or null when the section
 * has no data-empty state by design: `settings` always renders its facts
 * (PaySwap identity, upstream attribution, the store durability fact for
 * THIS mount, the advanced developer workspace entry).
 */
export function consoleSectionEmptyState(id: ConsoleSectionId): ConsoleSectionEmptyState | null {
  return SECTION_EMPTY_STATES.find((state) => state.sectionId === id) ?? null;
}

/* ====================================================================
 * Connections coverage facts (§6 connections)
 * ==================================================================== */

/** The typed connection-coverage fact when zero capabilities are connected. */
export type ConsoleConnectionCoverageFact = "NO_EVIDENCE_COVERAGE";

/** §6: the honest input when zero capabilities are connected on recorded evidence. */
export const NO_EVIDENCE_COVERAGE: ConsoleConnectionCoverageFact = "NO_EVIDENCE_COVERAGE";

/** The one-line people-language meaning of NO_EVIDENCE_COVERAGE. */
export const NO_EVIDENCE_COVERAGE_NOTE =
  "Zero capabilities are connected on recorded evidence — catalogue support is never a connection (INV-13)." as const;
