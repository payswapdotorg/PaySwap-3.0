/**
 * @payswap/app — the MODEL/DIFFICULTY CONTROLS pins (P21-B run 3,
 * ADR-0014 D4 — the app side).
 *
 * MIRROR DISCIPLINE (the missionIntakePins.ts pattern): the selection
 * record + the disclosure note mirror the shared surface contract
 * (packages/surface/src/agent-tasks.ts — AgentTaskModelSelection +
 * AGENT_TASK_MODEL_DISCLOSURE_NOTE, mirrored in ../lib/agent-task-pins.ts
 * and verified byte-identically by test/payswap/agent-task-pin-mirror
 * .test.ts); the CATALOG shape mirrors the REAL substrate model catalog
 * — @zcode/shared zcode-protocol `zcodeModelOptionSchema`
 * (ZCodeModelOption: ref {providerId, modelId}, label,
 * reasoning.levels[].value) as surfaced through
 * ZCodeSessionSettingsState.model.available and projected by
 * packages/ui/src/lib/zcodeSessionProjection.ts (settings.model.current /
 * thoughtLevel). The app ships NO default catalog — an unbound catalog
 * renders the honest unbound note below, NEVER a fabricated model list.
 *
 * LAWS (ADR-0014 D4):
 * - The selection NEVER confers eligibility, authorization or security
 *   rights; the financial computation stays deterministic and
 *   model-independent (the honest no-narration-tier disclosure).
 * - The difficulty (reasoningLevel) drives REAL budget knobs ONLY — the
 *   count-based search budget (mirrors @payswap/route-planning
 *   RouteSearchBudget) and the scenario budget (mirrors the lab
 *   exploration budget the desktop engine adapter feeds) plus the
 *   explanation detail tier. NO eligibility/authorization/security key
 *   exists at any depth (battery-asserted).
 * - A foreign reasoning level FAILS CLOSED (typed error, never a
 *   coerced default budget) — no silent substitution, ever.
 */

import {
  AGENT_TASK_MODEL_DISCLOSURE_NOTE_PIN,
  type AgentTaskModelSelectionPin,
} from "../lib/agent-task-pins.js";

export { AGENT_TASK_MODEL_DISCLOSURE_NOTE_PIN };
export type { AgentTaskModelSelectionPin };

/* ------------------------------ the catalog ------------------------------ */

/**
 * One catalog model (STRUCTURAL PIN of the substrate ZCodeModelOption:
 * ref.providerId + ref.modelId + label + reasoning.levels[].value — the
 * fields the controls consume; everything else stays substrate-owned).
 */
export interface CatalogModel {
  /** The substrate provider id (e.g. "zai") — opaque here. */
  readonly providerId: string;
  /** The substrate model id (e.g. "glm-5.2") — opaque here. */
  readonly modelId: string;
  /** The model's own display name (the substrate label). */
  readonly displayName: string;
  /** The model's OWN reasoning-level values (the difficulty vocabulary). */
  readonly reasoningLevels: readonly string[];
}

/**
 * The model-catalog port (the missionIntakePins pattern): the platform
 * host's composition root binds the REAL substrate catalog; the app
 * ships NO default (an unbound catalog renders the honest note).
 */
export interface ModelCatalogPort {
  /** The REAL available models (never a fabricated list). */
  listModels(): Promise<readonly CatalogModel[]>;
}

/** The honest unbound-catalog note (the web tier's truth — rendered VERBATIM). */
export const MODEL_CATALOG_UNBOUND_NOTE =
  "The model catalogue is not wired in this deployment — no model or difficulty can be selected honestly here, and none is substituted silently. The platform host binds the substrate model catalogue at its composition root; until then this composer states the gap instead of listing models." as const;

/* --------------------------- the controls state --------------------------- */

/** The model-controls phases (the honest state machine). */
export const MODEL_CONTROL_PHASES = Object.freeze([
  "UNBOUND", "LOADING", "READY", "ERROR",
] as const);
export type ModelControlPhase = (typeof MODEL_CONTROL_PHASES)[number];

/** The composer-projected model-controls state (the panel's view model). */
export interface ModelControlsState {
  readonly phase: ModelControlPhase;
  /** The hydrated catalog (empty until a REAL catalog loads). */
  readonly models: readonly CatalogModel[];
  /** The persisted selection (absent = never selected — never a default). */
  readonly selection?: AgentTaskModelSelectionPin;
  /** The honest error line when a catalog/selection call failed. */
  readonly error?: string;
}

export const MODEL_CONTROLS_UNBOUND_STATE: ModelControlsState = Object.freeze({ phase: "UNBOUND", models: [] });

/* ------------------------ the typed control error ------------------------ */

/** The typed, fail-closed model-controls error (never stringly control flow). */
export class ModelSelectionControlError extends Error {
  readonly code: "INVALID_SELECTION" | "NO_TASK" | "CATALOG_UNBOUND" | "FOREIGN_REASONING_LEVEL";
  constructor(code: ModelSelectionControlError["code"], message: string) {
    super(message);
    this.name = "ModelSelectionControlError";
    this.code = code;
  }
}

/** Fail-closed selection validation (mirrors the surface law: exact keys, non-empty strings). */
export function requireValidModelSelectionPin(candidate: unknown): AgentTaskModelSelectionPin {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new ModelSelectionControlError(
      "INVALID_SELECTION",
      "a model selection requires the record { providerId, modelId, reasoningLevel }",
    );
  }
  const record = candidate as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record).sort();
  if (keys.join(",") !== "modelId,providerId,reasoningLevel") {
    throw new ModelSelectionControlError(
      "INVALID_SELECTION",
      `modelSelection has unexpected fields: got [${keys.join(", ")}], want [modelId, providerId, reasoningLevel]`,
    );
  }
  for (const field of ["providerId", "modelId", "reasoningLevel"] as const) {
    if (typeof record[field] !== "string" || (record[field] as string).trim().length === 0) {
      throw new ModelSelectionControlError("INVALID_SELECTION", `modelSelection.${field} must be a non-empty string`);
    }
  }
  return Object.freeze({ ...(record as unknown as AgentTaskModelSelectionPin) });
}

/* ------------------- the difficulty→budget mapping (PURE) ------------------- */

/**
 * The count-based search budget (STRUCTURAL PIN of @payswap/route-planning
 * RouteSearchBudget — positive integers only, no wall clock; the receipt
 * vocabulary's own dimensions).
 */
export interface ModelSearchBudgetPin {
  readonly maxCandidates: number;
  readonly maxShapes: number;
  readonly maxCandidatesPerShape: number;
}

/**
 * The scenario budget (STRUCTURAL PIN of the lab exploration budget the
 * desktop engine adapter feeds exploreBoundedScenarios — count-based only).
 */
export interface ModelScenarioBudgetPin {
  readonly maxScenarios: number;
  readonly maxInterventionsPerRun: number;
  readonly maxDemands: number;
  readonly maxPools: number;
  readonly maxRails: number;
}

/** The explanation detail tier (the presentation depth — never a gate). */
export type ModelExplanationDetail = "MINIMAL" | "STANDARD" | "DETAILED";

/** The budget object a reasoning level maps to (budget knobs ONLY). */
export interface ReasoningLevelBudget {
  readonly searchBudget: ModelSearchBudgetPin;
  readonly scenarioBudget: ModelScenarioBudgetPin;
  readonly explanationDetail: ModelExplanationDetail;
}

/**
 * The pinned reasoning-level vocabulary the budget law maps (the
 * substrate's own reasoning-tier values; a model's levels that fall
 * outside it are refused honestly at the control — never coerced).
 */
export const AGENT_TASK_REASONING_LEVELS_PIN = Object.freeze(["low", "medium", "high"] as const);
export type PinnedReasoningLevel = (typeof AGENT_TASK_REASONING_LEVELS_PIN)[number];

/**
 * THE difficulty→budget mapping (the pinned PURE function, ADR-0014 D4):
 * reasoningLevel in → the EXACT budget object out; a FOREIGN level fails
 * closed. The knobs are count-based ONLY and NEVER touch eligibility,
 * authorization, security gates or the routine's resource limits — the
 * key set is battery-asserted ({searchBudget, scenarioBudget,
 * explanationDetail} at the top level, the REAL budget dimensions below).
 * "medium" equals the desktop composition's pinned defaults; "low" and
 * "high" tighten/widen them symmetrically.
 */
const REASONING_BUDGETS: Readonly<Record<PinnedReasoningLevel, ReasoningLevelBudget>> = Object.freeze({
  low: Object.freeze({
    searchBudget: Object.freeze({ maxCandidates: 5, maxShapes: 4, maxCandidatesPerShape: 5 }),
    scenarioBudget: Object.freeze({ maxScenarios: 2, maxInterventionsPerRun: 2, maxDemands: 5, maxPools: 5, maxRails: 5 }),
    explanationDetail: "MINIMAL",
  }),
  medium: Object.freeze({
    searchBudget: Object.freeze({ maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 }),
    scenarioBudget: Object.freeze({ maxScenarios: 5, maxInterventionsPerRun: 5, maxDemands: 5, maxPools: 5, maxRails: 5 }),
    explanationDetail: "STANDARD",
  }),
  high: Object.freeze({
    searchBudget: Object.freeze({ maxCandidates: 20, maxShapes: 18, maxCandidatesPerShape: 20 }),
    scenarioBudget: Object.freeze({ maxScenarios: 10, maxInterventionsPerRun: 8, maxDemands: 10, maxPools: 10, maxRails: 10 }),
    explanationDetail: "DETAILED",
  }),
});

/** The pure mapping (deterministic; frozen results; foreign levels FAIL CLOSED). */
export function modelBudgetOf(reasoningLevel: string): ReasoningLevelBudget {
  const budget = (REASONING_BUDGETS as Readonly<Record<string, ReasoningLevelBudget | undefined>>)[reasoningLevel];
  if (budget === undefined) {
    throw new ModelSelectionControlError(
      "FOREIGN_REASONING_LEVEL",
      `reasoning level '${reasoningLevel}' has no pinned budget mapping — the difficulty→budget law fails closed (never a coerced default budget; the pinned levels are [${AGENT_TASK_REASONING_LEVELS_PIN.join(", ")}])`,
    );
  }
  return budget;
}
