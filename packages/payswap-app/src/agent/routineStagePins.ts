/**
 * @payswap/app — STRUCTURAL PINS of the routine-stage contract (P21-B,
 * ADR-0014 D3; the missionIntakePins.ts mirror discipline).
 *
 * MIRROR DISCIPLINE: @payswap/app src NEVER imports a @payswap/*
 * workspace package (product law P2, machine-checked) — the surface's
 * routine-stage contract (packages/surface/src/agent-routine-stages.ts,
 * P21-B run 1) is pinned STRUCTURALLY here (same literals, same frozen
 * order, byte-identical declaration fields), and the mirror is verified
 * against the REAL source by test/payswap/routine-stage-pin-mirror.test
 * .ts (test-only relative imports). THE ONE WORKFLOW VOCABULARY LAW:
 * the stage ids, titles, handler ids, branches, advisory flags and
 * authority classes below are the routine manifest's OWN twelve stages
 * — this file NEVER invents a second workflow vocabulary.
 *
 * The projection vocabulary (PENDING / IN_PROGRESS / COMPLETED) is the
 * surface contract's own plan-status vocabulary (the substrate
 * status-panel plan pattern). A stage COMPLETES only from its typed
 * service result — never from prose, never from a static checklist.
 */

/* ------------------------- the stage vocabulary ----------------------- */

/** Mirrors surface AGENT_ROUTINE_STAGE_IDS (same literals, same order). */
export const AGENT_ROUTINE_STAGE_IDS_PIN = Object.freeze([
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9a", "9b", "10",
] as const);
export type AgentRoutineStageIdPin = (typeof AGENT_ROUTINE_STAGE_IDS_PIN)[number];

/** Mirrors surface AgentRoutineStageBranch. */
export type AgentRoutineStageBranchPin = "LINEAR" | "ALTERNATIVE";

/** Mirrors surface AgentRoutineStageAuthorityClass. */
export type AgentRoutineStageAuthorityClassPin =
  | "DISCOVERY"
  | "ADVISORY"
  | "PRESENTATION"
  | "EFFECT_BEARING"
  | "RECONCILIATION";

/** Mirrors surface AgentRoutineStageDeclaration (every field). */
export interface AgentRoutineStageDeclarationPin {
  readonly stageId: AgentRoutineStageIdPin;
  readonly title: string;
  readonly handlerId: string;
  readonly branch: AgentRoutineStageBranchPin;
  readonly advisory: boolean;
  readonly authorityClass: AgentRoutineStageAuthorityClassPin;
  readonly prerequisites: string;
  readonly checkpoint: string;
}

/**
 * The twelve stages, pinned BY VALUE from the surface contract (which
 * pins them BY VALUE from the routine manifest — the ONE vocabulary).
 */
export const AGENT_ROUTINE_STAGES_PIN: readonly AgentRoutineStageDeclarationPin[] = Object.freeze([
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
    checkpoint: "Confirmed/failed/UNKNOWN backed by provider evidence, a durable report and the append-only timeline — reconciliation closes it.",
  },
]);

/* --------------------- the plan-status vocabulary --------------------- */

/** Mirrors surface AGENT_TASK_STAGE_STATUSES (the plan pattern's own words). */
export const AGENT_TASK_STAGE_STATUSES_PIN = Object.freeze([
  "PENDING", "IN_PROGRESS", "COMPLETED",
] as const);
export type AgentTaskStageStatusPin = (typeof AGENT_TASK_STAGE_STATUSES_PIN)[number];

/** Mirrors surface ROUTINE_STAGE_STATUS_LABELS (scan-clean render words). */
export const ROUTINE_STAGE_STATUS_LABELS_PIN: Readonly<Record<AgentTaskStageStatusPin, string>> =
  Object.freeze({
    PENDING: "pending",
    IN_PROGRESS: "in progress",
    COMPLETED: "completed",
  });

/** Mirrors surface AgentTaskStageProgress (the per-stage projection row). */
export interface AgentTaskStageProgressPin {
  readonly stageId: AgentRoutineStageIdPin;
  readonly title: string;
  readonly status: AgentTaskStageStatusPin;
  /** People-language summary of the typed result that set this status. */
  readonly summary: string;
  /** The stage's prerequisite line (rendered while not completed). */
  readonly prerequisites: string;
  /** The typed checkpoint that completes the stage (rendered always). */
  readonly checkpoint: string;
  readonly advisory: boolean;
}

/* -------------------------- the honest notes -------------------------- */

/**
 * The unbound-mission-tier note (the web tier's honest truth — the D3
 * analogue of the ADR-0010 D7 web law): no mission timeline means no
 * stage checklist, never a fabricated one.
 */
export const ROUTINE_STAGE_PANEL_UNBOUND_NOTE =
  "The stage checklist is not wired in this deployment — it is derived from the payment mission's typed timeline, and no mission plane is bound here. The platform host binds the mission-plane channel at its composition root; until then this panel states the gap instead of simulating progress." as const;
