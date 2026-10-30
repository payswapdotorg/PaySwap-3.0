/**
 * @payswap/route-planning — the multi-hop hypothesis stage (P23-C, lane C;
 * ADR-0015 D5 — the REAL planner re-run over the verified segments).
 *
 * A RouteHypothesis is NEVER a RoutePlan, NEVER enters available-now,
 * NEVER feeds eligibility: the structural guard
 * `assertHypothesisIsNotARoutePlan` (the marker-field style scan at every
 * nesting depth) fails closed on any hypothesis smuggling RoutePlan-shaped
 * fields, `hypothesesPermitExecution()` is the literal false, and every
 * hypothesis carries `neverExecutable: true` + `advisoryOnly: true` — the
 * only route onward is fresh planning, preview and NEW explicit
 * authorization. The frozen nine-shape vocabulary is UNCHANGED (the
 * P21-0 C8 law): a hypothesis CITES a shape skeleton as provenance
 * (`shapeId` + the leg-kind sequence — both closed pinned vocabularies),
 * never compiles one.
 *
 * The REAL planner is reached ONLY through the INJECTED PlannerReRunPort —
 * a pinned STRUCTURAL seam the composition root binds to the REAL planner
 * over the REAL sub-views (the sender-side and recipient-side snapshots
 * through the existing machinery): the port returns the rank-eligible plan
 * ids over the real views (the segments verifiable TODAY) + the remaining
 * REAL exclusions. The default port FAILS CLOSED with a typed
 * PortUnboundError naming the exact stage "stage-7:derive-route-hypotheses".
 */

import { PortUnboundError, RoutePlanningError } from "./errors.ts";
import { contentDigest, deepFreeze, isNonEmptyString, isRecord, requireObject } from "./canonical.ts";
import { PINNED_ROUTE_SHAPE_IDS } from "./pins/route-compiler.ts";
import { PINNED_ROUTE_LEG_KINDS } from "./pins/hypotheses.ts";
import type {
  PinnedCitedShapeSkeleton,
  PinnedHypothesisSegment,
  PinnedHypotheticalCorridorView,
  PinnedRouteHypothesis,
} from "./pins/hypotheses.ts";
import type { GroundedExclusionFact } from "./conditional-stage.ts";

/** The stage this seam serves (frozen; the unbound error names it exactly). */
export const ROUTE_HYPOTHESIS_STAGE = "stage-7:derive-route-hypotheses" as const;

/**
 * The pinned result of the REAL planner re-run: the rank-eligible plan ids
 * over the REAL sub-views (ids only — a hypothesis never carries compiled
 * plans) + the remaining REAL exclusions (verbatim grounded facts) + THE
 * BRIDGE PROOF's plan ids (the P23 correctness patch, 2026-10-29).
 */
export interface PlannerReRunResult {
  readonly rankedEligible: readonly string[];
  /**
   * THE BRIDGE PROOF (the P23 correctness patch): the plan ids over the
   * AUGMENTED view that PROVABLY incorporate the EXACT assumed element —
   * PLANNER_VERIFIED requires at least one. A re-run that cannot prove
   * the assumed element's participation returns the EMPTY set and the
   * hypothesis stays UNVERIFIED: the badge never means merely that some
   * real route was eligible. The ids are ADVISORY candidate identities
   * (the proof machinery namespaces them `hypothesis-plan:`), never
   * compiled RoutePlan ids.
   */
  readonly assumedElementPlanIds: readonly string[];
  readonly exclusions: readonly GroundedExclusionFact[];
}

/**
 * The injected planner re-run seam (the composition root binds the REAL
 * planner over the REAL sub-views — the sender-side and recipient-side
 * snapshots through the existing machinery).
 */
export interface PlannerReRunPort {
  compileCorridorView(view: PinnedHypotheticalCorridorView): PlannerReRunResult;
}

/** A hypothesis-stage derivation input or port result violated the laws. */
export class RouteHypothesisError extends RoutePlanningError {
  constructor(message: string, details?: unknown) {
    super(message, "ROUTE_HYPOTHESIS_FAILED", details);
    this.name = "RouteHypothesisError";
  }
}

/** THE ADVISORY LAW: a hypothesis NEVER permits execution — the literal false. */
export function hypothesesPermitExecution(): false {
  return false;
}

/**
 * The RoutePlan-shaped marker fields (the guard's closed set). `shapeId` is
 * DELIBERATELY ABSENT: the cited shape skeleton legitimately cites a frozen
 * shape id as PROVENANCE (the C8 law — a citation, never a compiled plan);
 * every field below exists ONLY on a compiled RoutePlan.
 */
const ROUTE_PLAN_MARKER_FIELDS: readonly string[] = [
  "planId", "planDigest", "legs", "score", "candidateStatus", "comparability",
  "railCrossings", "isProviderNativeBaseline", "compositionClass", "executionMode",
  "environmentClasses",
];

function scanForRoutePlanMarkers(value: unknown, path: string, offenders: string[]): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      scanForRoutePlanMarkers(value[index], `${path}[${index}]`, offenders);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const key of Object.keys(value)) {
    if (ROUTE_PLAN_MARKER_FIELDS.includes(key)) {
      offenders.push(`${path}.${key}`);
    }
    scanForRoutePlanMarkers(value[key], `${path}.${key}`, offenders);
  }
}

/**
 * THE STRUCTURAL GUARD: a hypothesis is NEVER a RoutePlan. The
 * marker-field scan runs at EVERY nesting depth — a hypothesis carrying a
 * planId, legs, a score or any other RoutePlan-shaped field FAILS CLOSED.
 */
export function assertHypothesisIsNotARoutePlan(hypothesis: unknown): void {
  const offenders: string[] = [];
  scanForRoutePlanMarkers(hypothesis, "hypothesis", offenders);
  if (offenders.length > 0) {
    throw new RouteHypothesisError(
      `a RouteHypothesis is NEVER a RoutePlan — RoutePlan-shaped fields fail closed: ${offenders.join(", ")}`,
      { offenders },
    );
  }
}

/** The UNBOUND planner re-run port (fail closed): every call throws naming the exact stage. */
export function unboundPlannerReRunPort(): PlannerReRunPort {
  return {
    compileCorridorView(view: PinnedHypotheticalCorridorView): PlannerReRunResult {
      void view;
      throw new PortUnboundError(
        "the planner re-run engine is not bound — bind a real PlannerReRunPort at the composition root (the REAL planner over the REAL sub-views; ADR-0009 D2: an unbound engine is an honest typed failure, never a fallback, never fabricated verified segments)",
        { stage: ROUTE_HYPOTHESIS_STAGE },
      );
    },
  };
}

/** Require an injected planner re-run port (fail closed on a missing binding). */
export function requirePlannerReRunPort(candidate: unknown): PlannerReRunPort {
  if (candidate === null || typeof candidate !== "object" || typeof (candidate as PlannerReRunPort).compileCorridorView !== "function") {
    throw new PortUnboundError(
      "a PlannerReRunPort must be injected (an object implementing compileCorridorView) — the hypothesis stage never fabricates verified segments",
      { stage: ROUTE_HYPOTHESIS_STAGE },
    );
  }
  return candidate as PlannerReRunPort;
}

/** Fail-closed validation of the cited shape skeleton (provenance only — never a compiled plan). */
function validatedCitedSkeleton(candidate: unknown): PinnedCitedShapeSkeleton {
  const record = requireObject(candidate, "the cited shape skeleton");
  const shapeId = record["shapeId"];
  if (typeof shapeId !== "string" || !(PINNED_ROUTE_SHAPE_IDS as readonly string[]).includes(shapeId)) {
    throw new RouteHypothesisError(
      `the cited shape skeleton's shapeId '${String(shapeId)}' is not one of the NINE pinned frozen route shapes — the shape vocabulary is UNCHANGED (the P21-0 C8 law)`,
    );
  }
  const legKindSequence = record["legKindSequence"];
  if (
    !Array.isArray(legKindSequence) || legKindSequence.length === 0 ||
    !legKindSequence.every((kind) => typeof kind === "string" && (PINNED_ROUTE_LEG_KINDS as readonly string[]).includes(kind))
  ) {
    throw new RouteHypothesisError("the cited shape skeleton's legKindSequence must be a non-empty sequence over the pinned 8-kind leg vocabulary");
  }
  return record as unknown as PinnedCitedShapeSkeleton;
}

/** Fail-closed validation of the re-run result (a lying port never composes). */
function validatedReRunResult(result: unknown): PlannerReRunResult {
  const record = requireObject(result, "the planner re-run result");
  const rankedEligible = record["rankedEligible"];
  if (!Array.isArray(rankedEligible) || !rankedEligible.every((id) => isNonEmptyString(id)) || new Set(rankedEligible).size !== rankedEligible.length) {
    throw new RouteHypothesisError("the re-run result's rankedEligible must be an array of unique non-empty plan ids");
  }
  const assumedElementPlanIds = record["assumedElementPlanIds"];
  if (
    !Array.isArray(assumedElementPlanIds) ||
    !assumedElementPlanIds.every((id) => isNonEmptyString(id)) ||
    new Set(assumedElementPlanIds).size !== assumedElementPlanIds.length
  ) {
    throw new RouteHypothesisError(
      "the re-run result's assumedElementPlanIds must be an array of unique non-empty plan ids (the bridge proof's advisory candidate identities — the empty set is the honest unproven answer)",
    );
  }
  // THE DISJOINTNESS LAW (the P23 correctness patch): a plan compiled over
  // the UNCHANGED real sub-views can never incorporate an element that does
  // not exist there — an id appearing in BOTH sets is a lying port and
  // fails closed (never a fabricated participation proof).
  const realIds = new Set(rankedEligible);
  for (const id of assumedElementPlanIds) {
    if (realIds.has(id)) {
      throw new RouteHypothesisError(
        `the re-run result claims the plan id '${id}' both as a real rank-eligible plan over the unchanged sub-views AND as incorporating the assumed element — a plan over the real views can never incorporate an element that does not exist there (a lying port never composes)`,
        { planId: id },
      );
    }
  }
  const exclusions = record["exclusions"];
  if (!Array.isArray(exclusions)) {
    throw new RouteHypothesisError("the re-run result's exclusions must be an array of grounded exclusion facts");
  }
  for (const exclusion of exclusions) {
    const fact = requireObject(exclusion, "a re-run exclusion");
    if (
      (fact["side"] !== "SENDER" && fact["side"] !== "RECIPIENT") ||
      !isNonEmptyString(fact["routeId"]) || !isNonEmptyString(fact["code"]) || !isNonEmptyString(fact["message"])
    ) {
      throw new RouteHypothesisError("every re-run exclusion must carry side, routeId, code and message (the verbatim grounded-fact shape)");
    }
  }
  return record as unknown as PlannerReRunResult;
}

/** The hypothesis-stage derivation input. */
export interface RouteHypothesisDerivationInput {
  /** The hypothetical corridor view (hypothetical-views.ts deriveHypotheticalView). */
  readonly view: PinnedHypotheticalCorridorView;
  readonly reRunPort: PlannerReRunPort;
  /** The cited frozen shape skeleton — PROVENANCE ONLY, never a compiled plan. */
  readonly citedShapeSkeleton: PinnedCitedShapeSkeleton;
  readonly operatorId: string;
  readonly at: number;
}

/**
 * Derive ONE route hypothesis: re-run the REAL planner over the REAL
 * sub-views through the injected port, label the verified segments (real
 * rank-eligible ids) and the hypothetical segments (the assumed element),
 * carry the remaining REAL exclusions verbatim as blockers, and compute
 * the honest structural assessment — `wouldCompose` is TRUE only when the
 * re-run's BRIDGE PROOF compiled a typed candidate PROVABLY incorporating
 * the EXACT assumed element (`assumedElementPlanIds` non-empty). The
 * pre-patch law (any real rank-eligible segment + any assumed element)
 * let a valid real route and an UNRELATED assumed element coexist into a
 * false PLANNER_VERIFIED — that compatibility defect is closed here: a
 * re-run that cannot prove the assumed element's participation returns
 * the empty proof set and the hypothesis stays UNVERIFIED (conservative;
 * UNKNOWN is never guessed into true). The output is deep-frozen,
 * advisory-branded and self-checked by the structural guard.
 */
export function deriveRouteHypothesis(input: RouteHypothesisDerivationInput): PinnedRouteHypothesis {
  const request = requireObject(input, "the route-hypothesis derivation request");
  const viewRecord = requireObject(request["view"], "the hypothetical corridor view");
  const view = viewRecord as unknown as PinnedHypotheticalCorridorView;
  if (!isNonEmptyString(view.variantId) || !isNonEmptyString(view.baseViewDigest) || !isNonEmptyString(view.operatorId) || !isRecord(view.augmentation)) {
    throw new RouteHypothesisError("the hypothetical view must carry variantId, baseViewDigest, operatorId and its ONE augmentation (hypothetical-views.ts deriveHypotheticalView)");
  }
  const reRunPort = requirePlannerReRunPort(request["reRunPort"]);
  const citedShapeSkeleton = validatedCitedSkeleton(request["citedShapeSkeleton"]);
  const operatorId = request["operatorId"];
  if (!isNonEmptyString(operatorId) || operatorId !== view.operatorId) {
    throw new RouteHypothesisError("the operatorId must be a non-empty string matching the hypothetical view's operator (the hypothesis cites its operator)");
  }
  const at = request["at"];
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw new RouteHypothesisError("the derivation instant must be a non-negative integer millisecond instant (caller-supplied, no ambient clock)");
  }

  const reRun = validatedReRunResult(reRunPort.compileCorridorView(view));
  const verifiedSegments: readonly PinnedHypothesisSegment[] = Object.freeze(
    reRun.rankedEligible.map((segmentId) => deepFreeze({ segmentId, label: "VERIFIED" as const })),
  );
  const augmentation = view.augmentation;
  const assumedSegmentId =
    augmentation.kind === "ADD_ASSUMED_RAIL"
      ? augmentation.rail.assumedRailId
      : augmentation.kind === "ADD_ASSUMED_CONVERSION_ASSET"
        ? augmentation.asset.assumedAssetId
        : augmentation.operation.assumedOperationId;
  const hypotheticalSegments: readonly PinnedHypothesisSegment[] = Object.freeze([
    deepFreeze({ segmentId: assumedSegmentId, label: "ASSUMED" as const }),
  ]);
  const blockers = Object.freeze([...reRun.exclusions]);

  // The honest structural assessment (the P23 correctness patch law):
  // TRUE only when the re-run's bridge proof compiled a typed candidate
  // PROVABLY incorporating the EXACT assumed element. The verified real
  // segments alone NEVER verify — a valid real route plus an unrelated
  // assumed element is exactly the case that must stay UNVERIFIED.
  const wouldCompose = reRun.assumedElementPlanIds.length > 0;
  const verification = wouldCompose ? ("PLANNER_VERIFIED" as const) : ("UNVERIFIED" as const);
  const verificationReason = wouldCompose
    ? `the re-run's bridge proof compiled a typed candidate incorporating the EXACT assumed element (${reRun.assumedElementPlanIds.join(", ")}) — the element provably participates in an eligible composed candidate, never merely that some real route was eligible (advisory — the composition is never claimed executable)`
    : blockers.length > 0
      ? `the re-run proved NO typed candidate incorporating the assumed element — no bridge proof was returned (the element does not provably span the corridor's declared pair, or a remaining blocker is not answered by its augmentation kind); the remaining REAL exclusions block the corridor (${blockers.map((blocker) => blocker.code).join(", ")})`
      : "the re-run proved NO typed candidate incorporating the assumed element — no bridge proof was returned and nothing was guessed into true";

  const hypothesisDigest = contentDigest({
    hypothesisId: view.variantId,
    operatorId,
    assumption: augmentation,
    verifiedSegments,
    hypotheticalSegments,
    citedShapeSkeleton,
    blockers,
    assumedElementPlanIds: reRun.assumedElementPlanIds,
    wouldCompose,
    neverExecutable: true,
    derivedAt: at,
  });
  const hypothesis: PinnedRouteHypothesis = deepFreeze({
    hypothesisId: view.variantId,
    operatorId,
    assumption: augmentation,
    verifiedSegments,
    hypotheticalSegments,
    citedShapeSkeleton,
    blockers,
    wouldCompose,
    verification,
    verificationReason,
    neverExecutable: true,
    advisoryOnly: true,
    derivedAt: at,
    hypothesisDigest,
  });
  assertHypothesisIsNotARoutePlan(hypothesis);
  return hypothesis;
}
