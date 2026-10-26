/**
 * @payswap/app — STRUCTURAL PINS of the payment route-planning routine's
 * UX vocabulary (P16-D part 3, ADR-0009 D2/D8; gap-matrix row D5).
 *
 * MIRROR DISCIPLINE (the established src/lib/agent-task-pins.ts pattern):
 * @payswap/app src NEVER imports a @payswap/* workspace package (product law
 * P2, machine-checked) — every cross-package surface is pinned STRUCTURALLY here
 * (same literals, same frozen vocabularies, byte-identical value pins), and the
 * mirror is verified against the REAL sources by test/payswap/
 * route-planning-acceptance.test.ts (test-only relative imports). The platform
 * host binds the REAL engines at its composition root (ADR-0009 D2).
 *
 * Pins in this file (source modules named per pin): routine identity + skill
 * digest .... packages/route-planning/src/manifest.ts (ROUTINE_ID /
 * ROUTINE_VERSION / PINNED_SKILL_CONTENT_DIGEST); the wait vocabularies ....
 * packages/opportunities/src/wait-criteria.ts (WAIT_CATEGORIES / WAIT_FALLBACK_KINDS)
 * + src/model.ts (OPPORTUNITY_FAMILIES); the wait no-dispatch law ....
 * packages/surface/src/agent-tasks.ts (AGENT_TASK_WAIT_VOCABULARY — mirrored
 * in ../lib/agent-task-pins.ts).
 *
 * LAWS (ADR-0009 D8 + ROUTINE-CONTRACT stage table): the app NEVER writes
 * AUTHORIZATION_GRANTED (that event belongs to the real authority surface); a
 * wait match records OPPORTUNITY_MATCHED and the task STAYS WAITING
 * (matchAutoDispatches is the pinned literal false); the engine port FAILS
 * CLOSED — an unbound engine is an honest typed error naming the exact missing
 * binding, never a fallback, never fabricated routes. THE NO-INTENT LAW (P17-B):
 * when the engine's mission linkage resolves no mission carrying a compiled
 * intent, the panel renders the honest NO_VALIDATED_INTENT state — prose cannot
 * construct an intent (the D1 trigger law), never an error mask.
 * ZERO FINANCIAL AUTHORITY: this vocabulary names choices (PROCEED / WAIT),
 * never effects.
 */

import type { AgentTaskStatusPin } from "../lib/agent-task-pins.js";

/* ============ the routine identity pins (VALUE pins — byte-identical) ============ */

/** Mirrors route-planning ROUTINE_ID. A pin, not an import (product law P2). */
export const PINNED_ROUTE_PLANNING_ROUTINE_ID = "payment-route-planning" as const;
/** Mirrors route-planning ROUTINE_VERSION (the version every mission pins append-only). */
export const PINNED_ROUTE_PLANNING_ROUTINE_VERSION = "1.0.0" as const;
/**
 * Mirrors route-planning PINNED_SKILL_CONTENT_DIGEST — the fnv1a64 of the REAL
 * skills/payment-route-planning/SKILL.md bytes. Pinned byte-identically; the
 * acceptance test asserts equality with the REAL manifest value (drift fails closed in CI).
 */
export const PINNED_ROUTE_PLANNING_SKILL_DIGEST = "fnv1a64:1abba70f0107d1b2" as const;

/** The routine provenance every presented route view carries (frozen). */
export interface RoutePlanningRoutinePin {
  readonly routineId: typeof PINNED_ROUTE_PLANNING_ROUTINE_ID;
  readonly routineVersion: typeof PINNED_ROUTE_PLANNING_ROUTINE_VERSION;
  readonly skillContentDigest: typeof PINNED_ROUTE_PLANNING_SKILL_DIGEST;
}

export const PINNED_ROUTE_PLANNING_ROUTINE: RoutePlanningRoutinePin = Object.freeze({
  routineId: PINNED_ROUTE_PLANNING_ROUTINE_ID,
  routineVersion: PINNED_ROUTE_PLANNING_ROUTINE_VERSION,
  skillContentDigest: PINNED_ROUTE_PLANNING_SKILL_DIGEST,
});

/* ============ the routine's UX vocabulary (sections, choices, views) ============ */

/** The DISTINCT panel sections (stage 8: "distinct current routes vs
 * conditional opportunities ... exclusions, metrics, evidence freshness
 * and search coverage"; stage 9b's wait surface). Frozen order = order. */
export const ROUTE_PLANNING_SECTION_IDS = Object.freeze([
  "available-now", "exclusions", "truncation", "scenarios", "waiting",
] as const);
export type RoutePlanningSectionId = (typeof ROUTE_PLANNING_SECTION_IDS)[number];

/** The ONLY two choices stage 8 presents ("Proceed / Wait choice").
 * PROCEED is a REQUEST record; WAIT declares durable criteria. No third
 * choice exists — and no dispatch/execute/authorize verb is ever a kind. */
export const ROUTE_PLANNING_CHOICE_KINDS = Object.freeze(["PROCEED", "WAIT"] as const);
export type RoutePlanningChoiceKind = (typeof ROUTE_PLANNING_CHOICE_KINDS)[number];

/** The panel's view-model kinds: the honest UNBOUND engine state (the live-app truth until
 * the platform host binds the real engines), the PRESENTED plan (a validated engine view),
 * the honest NO_VALIDATED_INTENT state (no mission carries a compiled intent — the D1 law),
 * and the honest ENGINE_ERROR state (a failed engine is surfaced, never masked, never fabricated). */
export const ROUTE_PLANNING_PANEL_VIEW_KINDS = Object.freeze([
  "UNBOUND_ENGINE", "PRESENTED_PLAN", "ENGINE_ERROR", "NO_VALIDATED_INTENT",
] as const);
export type RoutePlanningPanelViewKind = (typeof ROUTE_PLANNING_PANEL_VIEW_KINDS)[number];

/* ============ the wait-criteria pin (mirrors opportunities WaitMatchCriteria) ============ */

/** Mirrors opportunities OPPORTUNITY_FAMILIES (same six literals, same order). */
export const ROUTE_PLANNING_OPPORTUNITY_FAMILIES_PIN = Object.freeze([
  "liquidity", "lending", "staking", "incentives", "arbitrage", "other",
] as const);
export type RoutePlanningOpportunityFamilyPin = (typeof ROUTE_PLANNING_OPPORTUNITY_FAMILIES_PIN)[number];

/** Mirrors opportunities WAIT_CATEGORIES (the six re-evaluation triggers). */
export const ROUTE_PLANNING_WAIT_CATEGORIES_PIN = Object.freeze([
  "NEW_OPPORTUNITY", "VERIFIED_RETURN_EVIDENCE", "CAPITAL_REQUIREMENT_KNOWN",
  "WITHDRAWAL_LIQUIDITY_OBSERVED", "FEES_KNOWN", "MAX_LOSS_BOUNDED",
] as const);
export type RoutePlanningWaitCategoryPin = (typeof ROUTE_PLANNING_WAIT_CATEGORIES_PIN)[number];

/** Mirrors opportunities WAIT_FALLBACK_KINDS (the user-selected expiry fallback). */
export const ROUTE_PLANNING_WAIT_FALLBACK_KINDS_PIN = Object.freeze([
  "PROCEED_WITH_FALLBACK_ROUTE", "REPLAN_FROM_FRESH_EVIDENCE", "CANCEL_WAIT",
] as const);
export type RoutePlanningWaitFallbackKindPin = (typeof ROUTE_PLANNING_WAIT_FALLBACK_KINDS_PIN)[number];

/** The durable wait criteria the Wait choice declares (SUBSET structural pin of
 * opportunities WaitMatchCriteria: the app-side choice never constructs the
 * optional exact-rational bounds — those stay in the opportunities authority;
 * the serialized record is what the task event carries). maxSettlementMs is
 * VALIDATED but NEVER APPLIED here — the route-compiler owns settlement-timing law. */
export interface RoutePlanningWaitCriteriaPin {
  readonly waitId: string;
  readonly families: readonly RoutePlanningOpportunityFamilyPin[];
  readonly categories: readonly RoutePlanningWaitCategoryPin[];
  readonly maxWaitMs: number;
  readonly maxSettlementMs: number;
  readonly fallback: { readonly kind: RoutePlanningWaitFallbackKindPin; readonly routeRef: string };
  readonly tradeOffs: readonly string[];
  readonly declaredAt: number;
}

/* ============ the opportunity-match pin (the five pure facts) ============ */

/** Mirrors the opportunities WaitEvaluation result (EXACTLY the five pure fact
 * keys): a wait match is a RECORD, never an action — no action/command/dispatch/
 * execute/authorize key at any name, and waitingNeverDispatches is the pinned
 * LITERAL false (ADR-0009 D8). */
export interface RoutePlanningOpportunityMatchPin {
  readonly matchedOpportunityIds: readonly string[];
  readonly categoryAttribution: Readonly<Record<string, readonly RoutePlanningWaitCategoryPin[]>>;
  readonly expired: boolean;
  readonly reasons: readonly string[];
  readonly waitingNeverDispatches: false;
}

/* ============ the engine view (stage 8's presentable projection) ============ */

/** One available-now ranked route (stage 5's transparent metrics, carried). */
export interface RoutePlanningRankedRoutePin {
  readonly planId: string; readonly shapeId: string; readonly rank: number;
  /** Exact-money net in minor units (a canonical integer string, never a float). */
  readonly netNumeraireMinorUnits: string; readonly numeraire: string;
  readonly hopCount: number; readonly railCrossings: number;
  /** Absent = UNKNOWN (retained and disclosed, never guessed). */
  readonly riskClass?: string; readonly estimatedSettlementMs?: number;
  readonly unknownDimensions: readonly string[];
  readonly paretoNonDominated: boolean; readonly dominatedBy: readonly string[];
}

/** An unscored-but-hard-eligible candidate: RETAINED and disclosed. */
export interface RoutePlanningNotScoredRoutePin {
  readonly planId: string; readonly shapeId: string; readonly reason: string;
  readonly unknownDimensions: readonly string[];
}

/** One typed exclusion (code + message; nothing dropped without a reason). */
export interface RoutePlanningExclusionPin {
  readonly subject: string; readonly code: string; readonly message: string;
}

/** One truncation receipt (the TRUE pre-cut count — ADR-0009 D6). */
export interface RoutePlanningTruncationReceiptPin {
  readonly dimension: string; readonly limit: number; readonly actualCount: number;
  readonly disclosedAs: "TRUNCATED";
}

/** One advisory conditional scenario (stage 6 — counterfactual, never production evidence). */
export interface RoutePlanningScenarioPin {
  readonly interventionId: string; readonly kind: string;
  readonly counterfactualId: string; readonly counterfactualDigest: string;
}

/** The engine view: stage 8's presentable projection. The sections are SEPARATED
 * by construction (available-now ranked routes never mix with exclusions, truncation,
 * advisory scenarios or the waiting surface) and the view digests deterministically
 * (identical engines + inputs → identical viewDigest — the determinism law). */
export interface RoutePlanningEngineView {
  readonly kind: "PRESENTED_PLAN";
  readonly routine: RoutePlanningRoutinePin;
  readonly intentRef: string;
  /** ISO-8601 UTC instant — DATA (the engine's evaluation instant). */
  readonly presentedAt: string;
  readonly availableNow: {
    readonly ranked: readonly RoutePlanningRankedRoutePin[];
    readonly notScored: readonly RoutePlanningNotScoredRoutePin[];
    readonly senderEligibleRouteIds: readonly string[];
    readonly recipientEligibleRouteIds: readonly string[];
  };
  readonly exclusions: readonly RoutePlanningExclusionPin[];
  readonly truncation: {
    readonly receipts: readonly RoutePlanningTruncationReceiptPin[];
    readonly coverage: "COMPLETE" | "TRUNCATED";
  };
  readonly scenarios: {
    readonly advisoryOnly: true;
    readonly coverage: "COMPLETE" | "TRUNCATED";
    readonly outcomes: readonly RoutePlanningScenarioPin[];
  };
  /** The engine's PROPOSED wait criteria (from its stage-7 discovery); the user's Wait choice declares them. */
  readonly waiting: { readonly proposal: RoutePlanningWaitCriteriaPin };
  readonly viewDigest: string;
}

/** The waiting surface's view state (projected from the task record): the task's
 * current status, the LAST recorded criteria (parsed back from the event record —
 * null when not recorded), the honest truncation fact when the serialized criteria
 * exceeded the transcript bound, and every matched opportunity id (in match order). */
export interface RoutePlanningWaitingState {
  readonly status: AgentTaskStatusPin;
  readonly criteria: RoutePlanningWaitCriteriaPin | null;
  readonly criteriaRecordTruncated: boolean;
  readonly matchedOpportunityIds: readonly string[];
}

/** The panel's view model (the pinned kinds; see ROUTE_PLANNING_PANEL_VIEW_KINDS). */
export type RoutePlanningPanelView =
  | { readonly kind: "UNBOUND_ENGINE" }
  | { readonly kind: "NO_VALIDATED_INTENT" }
  | { readonly kind: "PRESENTED_PLAN"; readonly view: RoutePlanningEngineView }
  | { readonly kind: "ENGINE_ERROR"; readonly message: string };

/* ============ the typed error + the fail-closed engine port (ADR-0009 D2) ============ */

export type RoutePlanningUxErrorCode =
  | "ENGINE_UNBOUND" | "INVALID_VIEW" | "INVALID_CRITERIA" | "INVALID_MATCH" | "NOT_WAITING";

/** The typed, fail-closed route-planning UX error (never stringly control flow). */
export class RoutePlanningUxError extends Error {
  readonly code: RoutePlanningUxErrorCode;
  constructor(code: RoutePlanningUxErrorCode, message: string) {
    super(message);
    this.name = "RoutePlanningUxError";
    this.code = code;
  }
}

/** One engine request: the agent task reference ONLY. The composer's people-language
 * intent is never the financial input contract (ROUTINE-CONTRACT trigger semantics:
 * the composer opening is not a trigger) — the engine resolves the validated typed
 * intent through its own mission linkage and fails closed when none exists. */
export interface RoutePlanningEngineRequest {
  readonly taskRef: string;
}

/** THE ROUTE-PLANNING ENGINE PORT (the console-injected composition seam, ADR-0009
 * D2): runs the REAL routine engines (stages 2-7 — corridor projection, route
 * compilation, hard gates + ranking, bounded scenario exploration, opportunity
 * matching) and returns the presentable view. The platform host binds the real
 * adapter; the app ships the UNBOUND default below. */
export interface RoutePlanningEnginePort {
  presentableView(request: RoutePlanningEngineRequest): RoutePlanningEngineView;
}

/** The UNBOUND engine (fail closed): every call throws the typed RoutePlanningUxError
 * naming the EXACT missing binding. Never fabricates a route, never fabricates an
 * exclusion, never falls back to LLM-only routing (the ROUTINE-CONTRACT acceptance law). */
export function unboundRoutePlanningEngine(): RoutePlanningEnginePort {
  return {
    presentableView(request: RoutePlanningEngineRequest): RoutePlanningEngineView {
      throw new RoutePlanningUxError(
        "ENGINE_UNBOUND",
        `the route-planning engine is not bound for task '${request.taskRef}' — bind a real RoutePlanningEnginePort at the composition root (stages 2-7: corridor projection, route compilation, hard gates + ranking, bounded scenario exploration, opportunity matching; ADR-0009 D2: an unbound engine is an honest typed failure, never a fallback, never fabricated routes)`,
      );
    },
  };
}

/** Require an injected engine port (fail closed on a missing binding). */
export function requireRoutePlanningEngine(candidate: unknown): RoutePlanningEnginePort {
  if (candidate === null || typeof candidate !== "object" ||
    typeof (candidate as RoutePlanningEnginePort).presentableView !== "function") {
    throw new RoutePlanningUxError(
      "ENGINE_UNBOUND",
      "a RoutePlanningEnginePort must be injected (an object implementing presentableView) — the route-planning panel never fabricates a route view",
    );
  }
  return candidate as RoutePlanningEnginePort;
}

/** True iff the thrown value is the typed unbound-engine failure. */
export function isRoutePlanningEngineUnbound(thrown: unknown): thrown is RoutePlanningUxError {
  return thrown instanceof RoutePlanningUxError && thrown.code === "ENGINE_UNBOUND";
}

/** The typed no-validated-intent outcome: the engine's mission linkage resolved no
 * mission carrying a compiled intent, and prose cannot construct one (the D1 trigger
 * law) — the honest result is the empty NO_VALIDATED_INTENT panel state, never an error mask. */
export class RoutePlanningNoIntentError extends Error {
  readonly kind = "NO_VALIDATED_INTENT" as const;
  constructor(message: string) {
    super(message);
    this.name = "RoutePlanningNoIntentError";
  }
}

/** True iff the thrown value is the typed no-validated-intent outcome. */
export function isRoutePlanningNoIntentError(thrown: unknown): thrown is RoutePlanningNoIntentError {
  return thrown instanceof RoutePlanningNoIntentError;
}

/* ============ the honest standing notes (rendered VERBATIM) ============ */

/** The available-now vs conditional separation law (stage 8's first honesty). */
export const ROUTE_PLANNING_AVAILABLE_NOW_NOTE =
  "Available now and conditional are separated: only routes compiled from currently connected, fresh, authorized evidence appear under available now — conditional scenarios are advisory counterfactuals over frozen facts, never routes you can take today." as const;

/** The truncation disclosure law (ADR-0009 D6 — completeness is never claimed while capped). */
export const ROUTE_PLANNING_TRUNCATION_NOTE =
  "Search is bounded and discloses truncation: when a cap cuts the candidate list, the receipt shows the true count before the cut — completeness is never claimed while capped." as const;

/** The evidence-freshness law (every route rests on dated, versioned observations). */
export const ROUTE_PLANNING_EVIDENCE_FRESHNESS_NOTE =
  "Every route rests on dated evidence: each rail snapshot carries its observation version and observed-at instant, and a stale observation never qualifies a rail — a plan is re-derived from fresh evidence, never trusted past it." as const;

/** The wait law in people language (ADR-0009 D8 — the never-dispatches fact). */
export const ROUTE_PLANNING_WAIT_NOTE =
  "A wait match never dispatches — only you can approve a payment: when an opportunity matches, this task records the match and stays waiting; proceeding always requires a fresh preview and an explicit scoped authorization on the real authority surface." as const;

/** The honest unbound-engine note (the live-app truth until the host binds the engines). */
export const ROUTE_PLANNING_ENGINE_UNBOUND_NOTE =
  "The route-planning engines are not wired in this deployment — no routes are shown because none can be honestly computed here. The composition root binds the real corridor, compiler and opportunities engines; until then this section states the gap instead of inventing routes." as const;

/** The honest no-validated-intent note (the D1 law in people language — rendered VERBATIM). */
export const ROUTE_PLANNING_NO_INTENT_NOTE = "No validated payment intent yet — route planning starts only from a validated typed intent (a mission whose intake compiled one). Complete the mission preview on the authority surface; this composer never fabricates an intent." as const;

/* ============ the deterministic view digest (the route-planning canonical flavor,
 * re-declared locally — zero sibling imports, ADR-0009 D4 fidelity; flavor fidelity
 * is asserted against the REAL package by the acceptance test) ============ */

/** Canonical, sort-stable JSON text (bigint-aware) — the b:/n: value forms. */
export function routePlanningCanonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new RoutePlanningUxError("INVALID_VIEW", "canonical JSON rejects non-finite numbers");
      }
      return `n:${value.toString()}`;
    case "bigint":
      return `b:${value.toString()}`;
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => routePlanningCanonicalJson(item)).join(",")}]`;
      }
      const record = value as Readonly<Record<string, unknown>>;
      const parts: string[] = [];
      for (const key of Object.keys(record).sort()) {
        parts.push(`${JSON.stringify(key)}:${routePlanningCanonicalJson(record[key])}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new RoutePlanningUxError("INVALID_VIEW", `canonical JSON rejects values of type '${typeof value}'`);
  }
}

const MASK64 = 0xffff_ffff_ffff_ffffn;
const FNV_OFFSET = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME = 0x100_0000_01b3n;

/** FNV-1a 64 over text (deterministic binding, not security). */
export function routePlanningFnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index) & 0xff);
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** The value-form content digest over the canonical projection: fnv1a64:<16-hex>. */
export function routePlanningContentDigest(value: unknown): string {
  return `fnv1a64:${routePlanningFnv1a64(routePlanningCanonicalJson(value))}`;
}

/** The deterministic digest over an engine view's PRESENTATION projection
 * (routine + intentRef + every section's pinned surface). Identical
 * engines + inputs → identical digest (the mount's once-per-preview
 * guard and the session's event records bind it). */
export function routePlanningViewDigestOf(view: Omit<RoutePlanningEngineView, "viewDigest">): string {
  return routePlanningContentDigest({
    routine: view.routine,
    intentRef: view.intentRef,
    presentedAt: view.presentedAt,
    availableNow: view.availableNow,
    exclusions: view.exclusions,
    truncation: view.truncation,
    scenarios: view.scenarios,
    waiting: view.waiting,
  });
}
