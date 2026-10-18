/**
 * @payswap/route-compiler — the route plan contract + builder (P5-W1).
 *
 * PORT+ADAPT of the old compiler's route-plan.ts (432 lines, MMI-19):
 * the compiled OUTPUT contract. `buildRoutePlan` enforces every plan
 * construction law (fail-closed) and derives the honest candidate
 * status:
 *
 * 1. legs in [1, 8], hopIndex CONTIGUOUS from zero, legId the pure
 *    function of (planId, hop, kind), intentRef referenced (never
 *    re-declared);
 * 2. failureSemantics EXACTLY the frozen INV-X contract (structural,
 *    never per-leg configuration);
 * 3. finality.finalityNeverAssumed === true (INV-F06);
 * 4. evidenceRefs NON-EMPTY on every leg (INV-E02);
 * 5. custody CONTINUITY (assertCustodyContinuity — INV-C09);
 * 6. the leg kinds MATCH the shape's declared skeleton;
 * 7. the comparability VERDICT is evaluated for composed plans (the
 *    five-requirement law) and the plan carries the verdict +
 *    baseline exemption (INV-C08);
 * 8. the plan digest binds the canonical projection
 *    (deterministic; byte-identical replays).
 *
 * The plan carries the scored evaluation (net outcome in the policy
 * numeraire — computed by the compiler for comparable plans and
 * baselines) and the LINEAGE RECORD (the exact observation versions
 * decided on — see evidence.ts).
 */

import { InvalidRoutePlanError } from "./errors.ts";
import { deepFreeze, contentDigest } from "./canonical.ts";
import { assertCustodyContinuity } from "./custody.ts";
import type { CustodyTransfer } from "./custody.ts";
import { routePlanId, routeLegId } from "./identifiers.ts";
import { isRouteLegKind, type RouteLegKind } from "./leg-kinds.ts";
import {
  shapeExecutionMode,
  shapeIsProviderNativeBaseline,
  shapeCompositionClass,
  shapeLegSequence,
  isRouteShapeId,
  type RouteShapeId,
  type RouteCompositionClass,
  type RoutePlanCandidateStatus,
} from "./shapes.ts";
import { legIsExecutable } from "./leg-contracts.ts";
import type { RouteLegBase } from "./leg-contracts.ts";
import { evaluateComparabilityGate } from "./comparability-gate.ts";
import type { ComparabilityVerdict } from "./comparability-gate.ts";
import { ROUTE_LEG_FAILURE_SEMANTICS } from "./finality.ts";
import type { NetOutcomeEvaluation } from "./scoring.ts";
import { railCrossingMetric, type RailCrossingMetric } from "./rail-family.ts";
import type { MerchantNativeSettlementUnavailableMarker } from "./merchant-legs.ts";

/** A compiled route leg (the base union over the kind arms). */
export type RouteLeg = RouteLegBase;

/** One honest ineligibility reason (per-leg, coded, detailed). */
export interface RoutePlanIneligibilityReason {
  readonly legId: string;
  readonly code: string;
  readonly detail: string;
}

/** The compiled route plan (the output contract). */
export interface RoutePlan {
  readonly planId: string;
  readonly shapeId: RouteShapeId;
  readonly intentRef: string;
  readonly compositionClass: RouteCompositionClass;
  readonly executionMode: "PASS_THROUGH_NATIVE" | "COMPOSED_PAYSWAP" | "OPTIMIZED_MULTI_PROVIDER";
  /** INV-C08: this plan IS the incumbent provider's own native flow. */
  readonly isProviderNativeBaseline: boolean;
  readonly candidateStatus: RoutePlanCandidateStatus;
  readonly comparability: ComparabilityVerdict;
  readonly ineligibilityReasons: readonly RoutePlanIneligibilityReason[];
  readonly legs: readonly RouteLeg[];
  readonly evidenceRefs: readonly string[];
  readonly planDigest: string;
  readonly railCrossings: RailCrossingMetric;
  readonly environmentClasses: readonly string[];
  readonly merchantNativeSettlementUnavailable?: MerchantNativeSettlementUnavailableMarker;
  /** The scored evaluation (present for comparable plans and baselines). */
  readonly score?: NetOutcomeEvaluation;
}

/** The build input (the shape + the assembled legs + the plan inputs). */
export interface BuildRoutePlanInput {
  readonly intentRef: string;
  readonly shapeId: RouteShapeId;
  readonly legs: readonly RouteLeg[];
  readonly environmentClasses: readonly string[];
  readonly at: number;
  readonly score?: NetOutcomeEvaluation;
  readonly merchantNativeSettlementUnavailable?: MerchantNativeSettlementUnavailableMarker;
}

/**
 * Build a route plan (fail-closed on every construction law; derives
 * the honest status; deep-freezes the result).
 */
export function buildRoutePlan(input: BuildRoutePlanInput): RoutePlan {
  if (!isRouteShapeId(input.shapeId)) {
    throw new InvalidRoutePlanError(`shapeId '${input.shapeId}' is not a member of the closed shape vocabulary`);
  }
  const planId = routePlanId(input.intentRef, input.shapeId);
  if (input.legs.length < 1 || input.legs.length > 8) {
    throw new InvalidRoutePlanError(
      `a route plan carries between 1 and 8 legs (got ${input.legs.length}) — an empty plan is never fabricated and unbounded hops are never authorized`,
    );
  }
  const skeleton = shapeLegSequence(input.shapeId);
  if (input.legs.length !== skeleton.length) {
    throw new InvalidRoutePlanError(
      `shape '${input.shapeId}' declares ${skeleton.length} legs but ${input.legs.length} were assembled — the plan matches its shape skeleton exactly`,
    );
  }
  for (let index = 0; index < input.legs.length; index += 1) {
    const leg = input.legs[index] as RouteLeg;
    if (leg.hopIndex !== index) {
      throw new InvalidRoutePlanError(
        `leg ${index} carries hopIndex ${leg.hopIndex} — hop indexes are contiguous from zero`,
      );
    }
    if (leg.intentRef !== input.intentRef) {
      throw new InvalidRoutePlanError(
        `leg ${leg.legId} references intent '${leg.intentRef}' — a plan's legs reference the plan's own intent`,
      );
    }
    if (!isRouteLegKind(leg.legKind)) {
      throw new InvalidRoutePlanError(`leg ${leg.legId} kind is not a member of the closed vocabulary`);
    }
    if (leg.legKind !== skeleton[index]) {
      throw new InvalidRoutePlanError(
        `leg ${index} kind '${leg.legKind}' does not match shape '${input.shapeId}' skeleton '${skeleton[index]}'`,
      );
    }
    const expectedLegId = routeLegId(planId, index, leg.legKind as RouteLegKind);
    if (leg.legId !== expectedLegId) {
      throw new InvalidRoutePlanError(
        `leg ${index} id '${leg.legId}' is not the canonical id '${expectedLegId}' — leg ids are pure functions of the plan projection`,
      );
    }
    if (leg.failureSemantics !== ROUTE_LEG_FAILURE_SEMANTICS) {
      throw new InvalidRoutePlanError(
        `leg ${leg.legId} carries a foreign failure-semantics contract — the INV-X law is the frozen singleton, never per-leg configuration`,
      );
    }
    if (leg.finality.finalityNeverAssumed !== true) {
      throw new InvalidRoutePlanError(`leg ${leg.legId} asserts finality (INV-F06: never assumed)`);
    }
    if (leg.evidenceRefs.length === 0) {
      throw new InvalidRoutePlanError(`leg ${leg.legId} carries no evidence (INV-E02)`);
    }
  }
  assertCustodyContinuity(input.legs.map((leg) => leg.custody) as readonly CustodyTransfer[]);

  const isBaseline = shapeIsProviderNativeBaseline(input.shapeId);
  const comparability = evaluateComparabilityGate({
    legs: input.legs,
    isProviderNativeBaseline: isBaseline,
    at: input.at,
  });
  const ineligibilityReasons = deriveIneligibilityReasons(input.legs);
  let candidateStatus: RoutePlanCandidateStatus;
  if (ineligibilityReasons.length > 0) {
    candidateStatus = "INELIGIBLE_CANDIDATE";
  } else if (isBaseline) {
    candidateStatus = "PROVIDER_NATIVE_BASELINE";
  } else if (!comparability.comparable) {
    candidateStatus = "NOT_COMPARABLE";
  } else {
    candidateStatus = "EXECUTABLE_CANDIDATE";
  }

  const evidenceRefs = [...new Set(input.legs.flatMap((leg) => leg.evidenceRefs))];
  const planDigest = contentDigest({
    planId,
    shapeId: input.shapeId,
    intentRef: input.intentRef,
    compositionClass: shapeCompositionClass(input.shapeId),
    executionMode: shapeExecutionMode(input.shapeId),
    isProviderNativeBaseline: isBaseline,
    candidateStatus,
    comparability,
    legs: input.legs.map((leg) => ({
      legId: leg.legId,
      legKind: leg.legKind,
      authorization: leg.authorizationLineage.legAuthorization.kind,
      custody: leg.custody,
      plannedAmount: leg.plannedAmount,
      assumptions: leg.assumptions.length,
    })),
  });

  return deepFreeze({
    planId,
    shapeId: input.shapeId,
    intentRef: input.intentRef,
    compositionClass: shapeCompositionClass(input.shapeId),
    executionMode: shapeExecutionMode(input.shapeId),
    isProviderNativeBaseline: isBaseline,
    candidateStatus,
    comparability,
    ineligibilityReasons: Object.freeze(ineligibilityReasons),
    legs: Object.freeze([...input.legs]),
    evidenceRefs: Object.freeze(evidenceRefs),
    planDigest,
    railCrossings: railCrossingMetric(input.legs.map((leg) => leg.custody) as readonly CustodyTransfer[]),
    environmentClasses: Object.freeze([...input.environmentClasses]),
    ...(input.merchantNativeSettlementUnavailable !== undefined
      ? { merchantNativeSettlementUnavailable: input.merchantNativeSettlementUnavailable }
      : {}),
    ...(input.score !== undefined ? { score: input.score } : {}),
  });
}

function deriveIneligibilityReasons(
  legs: readonly RouteLeg[],
): RoutePlanIneligibilityReason[] {
  const reasons: RoutePlanIneligibilityReason[] = [];
  for (const leg of legs) {
    if (leg.authorizationLineage.legAuthorization.kind === "ONCHAIN_GATE_DECISION") {
      const decision = leg.authorizationLineage.legAuthorization.gateDecision.decision;
      if (decision === "BLOCK") {
        reasons.push({
          legId: leg.legId,
          code: "ONCHAIN_GATE_BLOCK",
          detail: `leg '${leg.legId}' is security-BLOCKed (rule 27 — the verdict is carried honestly, never overridden)`,
        });
      } else if (decision === "UNKNOWN") {
        reasons.push({
          legId: leg.legId,
          code: "ONCHAIN_GATE_UNKNOWN",
          detail: `leg '${leg.legId}' gate decision is UNKNOWN (INV-X01 — never coerced to pass)`,
        });
      }
    }
    if (leg.authorizationLineage.legAuthorization.kind === "PAYOUT_TRANSFER_OUT_GRANT") {
      const gate = leg.authorizationLineage.legAuthorization.gate;
      if (!gate.allowed || gate.checks.some((check) => !check.pass)) {
        reasons.push({
          legId: leg.legId,
          code: "PAYOUT_GATE_CLOSED",
          detail: `leg '${leg.legId}' payout gate does not allow the transfer-out`,
        });
      }
    }
    for (const failure of leg.stateGrounding.groundingFailures) {
      reasons.push({
        legId: leg.legId,
        code: "LEG_GROUNDING_FAILURE",
        detail: `leg '${leg.legId}' grounding failure: ${failure}`,
      });
    }
    void legIsExecutable;
  }
  return reasons;
}

/** The plan's leg custody chain (the walk's input). */
export function planCustodyChain(plan: RoutePlan): readonly CustodyTransfer[] {
  return plan.legs.map((leg) => leg.custody);
}
