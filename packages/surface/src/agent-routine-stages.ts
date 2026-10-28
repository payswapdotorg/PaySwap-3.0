/**
 * @payswap/surface — the agent ROUTINE-STAGE contract (P21-B, ADR-0014
 * D3/D4; NET-NEW additive module, SURFACE_API_VERSION 1.5.0).
 *
 * THE ONE WORKFLOW VOCABULARY LAW (ADR-0014 D3): the stage ids, titles,
 * handler ids, branches, advisory flags and authority classes below are
 * pinned BY VALUE from the payment-route-planning routine's OWN manifest
 * (spec/routines/payment-route-planning/ROUTINE-CONTRACT.md §"Stage
 * contract" + packages/route-planning/src/manifest.ts
 * PAYMENT_ROUTE_PLANNING_MANIFEST_V1.stages) — the canonical TWELVE
 * stages. This module NEVER invents a second workflow vocabulary: it
 * adds ONLY the projection fields a checklist surface needs (the
 * people-language prerequisite + checkpoint lines, the plan-status
 * vocabulary) and the provenance discipline every surface contract
 * carries. Drift against the manifest is caught by the consumer-side
 * mirror discipline (the app pins this module structurally; its
 * acceptance test asserts equality with the REAL manifest).
 *
 * THE PROJECTION LAW (D3): a stage COMPLETES only from its typed service
 * result (persisted typed events + the deterministic engine view) —
 * never from prose, never from a static checklist, never from a model
 * writing "done". The projection vocabulary here (PENDING / IN_PROGRESS /
 * COMPLETED) follows the substrate status-panel plan pattern
 * (TodoRead/TodoWrite-style plan projection); stages that never ran
 * render their PREREQUISITES, never "done".
 *
 * Deterministic library code: no ambient clock/locale/randomness, zero
 * runtime dependencies, framework-free (the boundary law).
 */

import { surfaceProvenance, type SurfaceContractProvenance } from "./version.ts";

/* ====================================================================
 * The twelve stages (pinned BY VALUE from the routine manifest)
 * ==================================================================== */

/**
 * The canonical stage ids (ROUTINE-CONTRACT's own): 0..10 with the two
 * stage-9 branches. Frozen order = the routine's execution order.
 */
export const AGENT_ROUTINE_STAGE_IDS = Object.freeze([
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9a", "9b", "10",
] as const);
export type AgentRoutineStageId = (typeof AGENT_ROUTINE_STAGE_IDS)[number];

/** The stage branches (the manifest's own vocabulary). */
export type AgentRoutineStageBranch = "LINEAR" | "ALTERNATIVE";

/** The stage authority classes (the manifest's own vocabulary). */
export type AgentRoutineStageAuthorityClass =
  | "DISCOVERY"
  | "ADVISORY"
  | "PRESENTATION"
  | "EFFECT_BEARING"
  | "RECONCILIATION";

/**
 * One stage declaration: the manifest's own fields (stageId/title/
 * handlerId/branch/advisory/authorityClass) PLUS the projection fields a
 * checklist surface renders (prerequisite + checkpoint, people language).
 */
export interface AgentRoutineStageDeclaration {
  readonly stageId: AgentRoutineStageId;
  /** VERBATIM from ROUTINE-CONTRACT's stage contract table. */
  readonly title: string;
  /** VERBATIM from the manifest's handler allowlist (never invented here). */
  readonly handlerId: string;
  readonly branch: AgentRoutineStageBranch;
  readonly advisory: boolean;
  readonly authorityClass: AgentRoutineStageAuthorityClass;
  /** What must hold before this stage can run (people language). */
  readonly prerequisites: string;
  /** The typed result that completes this stage (people language). */
  readonly checkpoint: string;
}

/** The twelve stages, pinned BY VALUE (frozen; the ONE workflow vocabulary). */
export const AGENT_ROUTINE_STAGES: readonly AgentRoutineStageDeclaration[] = Object.freeze([
  {
    stageId: "0",
    title: "Match + load",
    handlerId: "route-planning/match-and-load",
    branch: "LINEAR",
    advisory: false,
    authorityClass: "DISCOVERY",
    prerequisites: "A classified payment-mission intent seeded a task.",
    checkpoint: "The pinned versioned routine loaded: a ROUTINE_PINNED event records the routine id, version and skill digest.",
  },
  {
    stageId: "1",
    title: "Validate / clarify",
    handlerId: "route-planning/validate-and-clarify",
    branch: "LINEAR",
    advisory: false,
    authorityClass: "DISCOVERY",
    prerequisites: "The routine is pinned; the mission intake asks its missing fields in order.",
    checkpoint: "The mission's nine-field intake compiled a validated typed intent (NEEDS_INPUT gates until then — nothing is guessed).",
  },
  {
    stageId: "2",
    title: "Discover sender rails",
    handlerId: "route-planning/discover-sender-rails",
    branch: "LINEAR",
    advisory: false,
    authorityClass: "DISCOVERY",
    prerequisites: "A compiled typed intent; the corridor-projection engine binding.",
    checkpoint: "A versioned eligible sender rail snapshot with its typed exclusion reasons was derived.",
  },
  {
    stageId: "3",
    title: "Discover recipient rails",
    handlerId: "route-planning/discover-recipient-rails",
    branch: "LINEAR",
    advisory: false,
    authorityClass: "DISCOVERY",
    prerequisites: "A compiled typed intent; the corridor-projection engine binding.",
    checkpoint: "A versioned eligible recipient rail snapshot with its typed exclusion reasons was derived.",
  },
  {
    stageId: "4",
    title: "Compile available routes",
    handlerId: "route-planning/compile-available-routes",
    branch: "LINEAR",
    advisory: false,
    authorityClass: "DISCOVERY",
    prerequisites: "Both rail snapshots; the route-compilation engine binding.",
    checkpoint: "Supported route-plan candidates with typed exclusions were enumerated (discovery output is never executable authority).",
  },
  {
    stageId: "5",
    title: "Apply hard gates and rank",
    handlerId: "route-planning/apply-hard-gates-and-rank",
    branch: "LINEAR",
    advisory: false,
    authorityClass: "DISCOVERY",
    prerequisites: "The enumerated candidates.",
    checkpoint: "Only hard-eligible candidates remained, ranked with transparent metrics and deterministic ordering; UNKNOWN dimensions retained.",
  },
  {
    stageId: "6",
    title: "Explore bounded counterfactuals",
    handlerId: "route-planning/explore-bounded-counterfactuals",
    branch: "ALTERNATIVE",
    advisory: true,
    authorityClass: "ADVISORY",
    prerequisites: "The scenario-exploration engine binding (the advisory alternative branch).",
    checkpoint: "A bounded advisory scenario suite over frozen base facts was explored — never production evidence.",
  },
  {
    stageId: "7",
    title: "Discover offers and opportunities",
    handlerId: "route-planning/discover-opportunities",
    branch: "LINEAR",
    advisory: false,
    authorityClass: "DISCOVERY",
    prerequisites: "The opportunity-matching engine binding over evidence-backed observations.",
    checkpoint: "Evidence-backed offers/opportunities with provenance, privacy controls, expiry and opt-in semantics were discovered.",
  },
  {
    stageId: "8",
    title: "Present user choices",
    handlerId: "route-planning/present-choices",
    branch: "LINEAR",
    advisory: false,
    authorityClass: "PRESENTATION",
    prerequisites: "The ranked routes, exclusions, coverage and advisory scenarios.",
    checkpoint: "A PREVIEW_PRESENTED event recorded the distinct available-now vs conditional presentation with the Proceed / Wait choice.",
  },
  {
    stageId: "9a",
    title: "Proceed now",
    handlerId: "route-planning/proceed-now",
    branch: "ALTERNATIVE",
    advisory: false,
    authorityClass: "EFFECT_BEARING",
    prerequisites:
      "Fresh revalidation and preview, then an explicit fresh scoped authorization on the real authority surface — the only effect-bearing stage.",
    checkpoint: "The selected graph was revalidated, explicitly approved and dispatched through the connected capability; evidence and reconciliation follow.",
  },
  {
    stageId: "9b",
    title: "Wait for opportunities",
    handlerId: "route-planning/wait-for-opportunities",
    branch: "ALTERNATIVE",
    advisory: true,
    authorityClass: "ADVISORY",
    prerequisites: "An explicit Wait choice declaring durable criteria with a deadline (the advisory alternative branch).",
    checkpoint: "The wait records under explicit criteria; re-evaluation happens on fresh evidence; a match never dispatches by itself.",
  },
  {
    stageId: "10",
    title: "Reconcile and close",
    handlerId: "route-planning/reconcile-and-close",
    branch: "LINEAR",
    advisory: false,
    authorityClass: "RECONCILIATION",
    prerequisites: "A dispatched attempt carrying its provider correlation.",
    checkpoint: "Confirmed/failed/UNKNOWN backed by provider evidence, a durable report and the append-only timeline — an ambiguous attempt closes through reconciliation; a confirmed attempt closes through the typed authoritative read-back verification.",
  },
]);

/* ====================================================================
 * The plan-status vocabulary (the substrate status-panel plan pattern)
 * ==================================================================== */

/**
 * The per-stage projection statuses (D3): a stage completes ONLY from its
 * typed service result; a stage that never ran renders its prerequisites
 * (PENDING), never "done".
 */
export const AGENT_TASK_STAGE_STATUSES = Object.freeze([
  "PENDING", "IN_PROGRESS", "COMPLETED",
] as const);
export type AgentTaskStageStatus = (typeof AGENT_TASK_STAGE_STATUSES)[number];

/** The people-language render of each plan status (scan-clean). */
export const ROUTINE_STAGE_STATUS_LABELS: Readonly<Record<AgentTaskStageStatus, string>> =
  Object.freeze({
    PENDING: "pending",
    IN_PROGRESS: "in progress",
    COMPLETED: "completed",
  });

/* ====================================================================
 * The per-stage projection contract (what a checklist surface renders)
 * ==================================================================== */

/**
 * One projected stage row: the declaration's identity + the DERIVED
 * status, a human summary grounded in the typed result, and the
 * checkpoint line that completes it. Derivation lives in the consumer
 * (the app's pure projection over persisted typed events + the
 * deterministic engine view) — this surface owns only the vocabulary.
 */
export interface AgentTaskStageProgress {
  readonly stageId: AgentRoutineStageId;
  readonly title: string;
  readonly status: AgentTaskStageStatus;
  /** People-language summary of the typed result that set this status. */
  readonly summary: string;
  /** The stage's prerequisite line (rendered while not completed). */
  readonly prerequisites: string;
  /** The typed checkpoint that completes the stage (rendered always). */
  readonly checkpoint: string;
  readonly advisory: boolean;
}

/* ====================================================================
 * Provenance (the stability-boundary discipline)
 * ==================================================================== */

export const AGENT_ROUTINE_STAGES_PROVENANCE: SurfaceContractProvenance = surfaceProvenance(
  "P21-B",
  "experimental",
);
