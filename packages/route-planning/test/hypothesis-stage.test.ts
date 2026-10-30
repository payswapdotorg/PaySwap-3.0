import { describe, expect, it } from "vitest";
import {
  ROUTE_HYPOTHESIS_STAGE,
  RouteHypothesisError,
  assertHypothesisIsNotARoutePlan,
  deriveRouteHypothesis,
  hypothesesPermitExecution,
  requirePlannerReRunPort,
  unboundPlannerReRunPort,
  type PlannerReRunPort,
  type RouteHypothesisDerivationInput,
} from "../src/hypothesis-stage.ts";
import { corridorViewDigest, deriveHypotheticalView } from "../src/hypothetical-views.ts";
import { deriveRailSnapshotPair } from "../src/rail-snapshot.ts";
import { mergedCorridorView } from "../src/candidates.ts";
import type { PinnedRouteHypothesis, PinnedHypotheticalCorridorView } from "../src/pins/hypotheses.ts";
import { PortUnboundError } from "../src/errors.ts";
import {
  NOW,
  flwSenderChain,
  noRouteCorridorQuery,
  stripeRecipientChain,
} from "./no-route-fixtures.ts";
import { realCorridorProjectionPort } from "./fixtures.ts";

/**
 * THE MULTI-HOP HYPOTHESIS STAGE (P23-C, ADR-0015 D5): a RouteHypothesis
 * is NEVER a RoutePlan, NEVER enters available-now, NEVER feeds
 * eligibility; the verified/hypothetical segment labeling over the REAL
 * planner re-run port; wouldCompose honesty (conservative, never guessed
 * into true); the cited frozen shape skeleton is PROVENANCE ONLY.
 */

const OPERATOR_ID = "repair:intermediary-introduced";
const CITED_SKELETON = Object.freeze({
  shapeId: "provider-native-bridge",
  legKindSequence: Object.freeze(["FIAT_PSP_COLLECT", "PSP_STABLECOIN_ISSUANCE", "BANK_SETTLEMENT"] as const),
}) as unknown as import("../src/pins/hypotheses.ts").PinnedCitedShapeSkeleton;

function stubReRun(
  rankedEligible: readonly string[],
  exclusions: readonly { side: "SENDER" | "RECIPIENT"; routeId: string; code: string; message: string }[],
  assumedElementPlanIds: readonly string[] = [],
): PlannerReRunPort {
  return {
    compileCorridorView(view) {
      void view;
      return { rankedEligible, assumedElementPlanIds, exclusions };
    },
  };
}

function hypothesisInput(overrides: Partial<RouteHypothesisDerivationInput> = {}): RouteHypothesisDerivationInput {
  return {
    view: assumedRailView(),
    reRunPort: stubReRun(["plan:sender-segment-1"], [], ["hypothesis-plan:fixture-bridge"]),
    citedShapeSkeleton: CITED_SKELETON,
    operatorId: OPERATOR_ID,
    at: NOW,
    ...overrides,
  };
}

/** The genuine intermediary assumed-rail variant over the no-route corridor's merged base view (built through the REAL machinery). */
function assumedRailView(): PinnedHypotheticalCorridorView {
  const pair = deriveRailSnapshotPair({
    sender: {
      side: "SENDER", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [flwSenderChain()], corridorPort: realCorridorProjectionPort(),
    },
    recipient: {
      side: "RECIPIENT", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [stripeRecipientChain()], corridorPort: realCorridorProjectionPort(),
    },
  });
  const baseView = mergedCorridorView(pair.sender, pair.recipient, {
    sourceCountry: "NG",
    destinationCountry: "US",
    sourceCurrency: "NGN",
    destinationCurrency: "USD",
    asOf: "2026-10-05T00:00:00Z",
  });
  return deriveHypotheticalView({
    baseView,
    declaredBaseViewDigest: corridorViewDigest(baseView),
    operatorId: OPERATOR_ID,
    augmentations: [
      {
        kind: "ADD_ASSUMED_RAIL",
        rail: {
          assumed: true,
          assumedRailId: "assumed-rail:fixture-intermediary",
          providerName: "assumed:fixture-intermediary",
          railKind: "FIAT",
          sourceCurrency: "NGN",
          destinationCurrency: "USD",
          summary: "a verified intermediary rail bridges the sender's funding rail and the merchant's receiving context",
        },
      },
    ],
  });
}

describe("the multi-hop hypothesis stage (P23-C, ADR-0015 D5)", () => {
  it("the advisory law: a hypothesis NEVER permits execution — the literal false + the neverExecutable literal", () => {
    expect(hypothesesPermitExecution()).toBe(false);
    const hypothesis = deriveRouteHypothesis(hypothesisInput());
    expect(hypothesis.neverExecutable).toBe(true);
    expect(hypothesis.advisoryOnly).toBe(true);
    expect(hypothesis.hypothesisId).toBe(assumedRailView().variantId);
  });

  it("the verified/hypothetical labeling: real rank-eligible ids are VERIFIED, the assumed element is ASSUMED; the bridge proof verifies", () => {
    const hypothesis = deriveRouteHypothesis(hypothesisInput());
    expect(hypothesis.verifiedSegments).toEqual([{ segmentId: "plan:sender-segment-1", label: "VERIFIED" }]);
    expect(hypothesis.hypotheticalSegments).toEqual([{ segmentId: "assumed-rail:fixture-intermediary", label: "ASSUMED" }]);
    expect(hypothesis.wouldCompose).toBe(true);
    expect(hypothesis.verification).toBe("PLANNER_VERIFIED");
    expect(hypothesis.verificationReason).toContain("hypothesis-plan:fixture-bridge");
    expect(hypothesis.verificationReason).toContain("never merely that some real route was eligible");
  });

  it("THE P23 CORRECTNESS REGRESSION (the handoff §2.2 law): a valid real route and an UNRELATED assumed element NEVER verify — the badge cannot mean merely that some real route was eligible", () => {
    // A real rank-eligible route exists (rankedEligible non-empty) and the
    // re-run honestly returns NO bridge proof for the assumed element
    // (the default empty set — the element does not provably participate).
    // The pre-patch law computed wouldCompose from
    // `verifiedSegments.length > 0 && hypotheticalSegments.length > 0` and
    // produced a FALSE PLANNER_VERIFIED here; the patched law requires the
    // proof and stays UNVERIFIED.
    const hypothesis = deriveRouteHypothesis(hypothesisInput({ reRunPort: stubReRun(["plan:real-eligible-route-1"], []) }));
    expect(hypothesis.verifiedSegments).toEqual([{ segmentId: "plan:real-eligible-route-1", label: "VERIFIED" }]);
    expect(hypothesis.hypotheticalSegments).toEqual([{ segmentId: "assumed-rail:fixture-intermediary", label: "ASSUMED" }]);
    expect(hypothesis.wouldCompose).toBe(false);
    expect(hypothesis.verification).toBe("UNVERIFIED");
    expect(hypothesis.verificationReason).toContain("no bridge proof was returned");
  });

  it("the bridge proof alone verifies even with NO real rank-eligible segment — the assumed element is what composes the corridor (the honest positive direction)", () => {
    const hypothesis = deriveRouteHypothesis(
      hypothesisInput({ reRunPort: stubReRun([], [], ["hypothesis-plan:fixture-bridge"]) }),
    );
    expect(hypothesis.verifiedSegments).toEqual([]);
    expect(hypothesis.wouldCompose).toBe(true);
    expect(hypothesis.verification).toBe("PLANNER_VERIFIED");
    expect(hypothesis.verificationReason).toContain("hypothesis-plan:fixture-bridge");
  });

  it("the disjointness law: a port claiming ONE id as both a real rank-eligible plan AND a bridge-proof plan is a lying port and fails closed", () => {
    expect(() =>
      deriveRouteHypothesis(
        hypothesisInput({ reRunPort: stubReRun(["plan:claimed-both"], [], ["plan:claimed-both"]) }),
      ),
    ).toThrow(RouteHypothesisError);
    expect(() =>
      deriveRouteHypothesis(
        hypothesisInput({ reRunPort: stubReRun(["plan:a"], [], ["hypothesis-plan:b", "hypothesis-plan:b"]) }),
      ),
    ).toThrow(RouteHypothesisError);
  });

  it("wouldCompose honesty: a re-run that proves NOTHING stays UNVERIFIED with the honest remaining reason (never guessed into true)", () => {
    const blockers = [
      { side: "RECIPIENT" as const, routeId: "route:recipient-1", code: "FUNDING_METHOD_NOT_SERVED", message: "the funding method is not served" },
    ];
    const hypothesis = deriveRouteHypothesis(hypothesisInput({ reRunPort: stubReRun([], blockers) }));
    expect(hypothesis.wouldCompose).toBe(false);
    expect(hypothesis.verification).toBe("UNVERIFIED");
    expect(hypothesis.verificationReason).toContain("FUNDING_METHOD_NOT_SERVED");
    expect(hypothesis.blockers).toEqual(blockers);
  });

  it("the structural guard: a hypothesis smuggling RoutePlan-shaped fields fails closed (planId, legs, score)", () => {
    const hypothesis = deriveRouteHypothesis(hypothesisInput());
    assertHypothesisIsNotARoutePlan(hypothesis);
    expect(() => assertHypothesisIsNotARoutePlan({ ...hypothesis, planId: "plan:smuggled" })).toThrow(RouteHypothesisError);
    expect(() => assertHypothesisIsNotARoutePlan({ ...hypothesis, legs: [] })).toThrow(RouteHypothesisError);
    expect(() => assertHypothesisIsNotARoutePlan({ ...hypothesis, score: 1 })).toThrow(RouteHypothesisError);
    // The cited shapeId is PROVENANCE, not a compiled plan — the guard deliberately allows it.
    expect(hypothesis.citedShapeSkeleton.shapeId).toBe("provider-native-bridge");
  });

  it("the cited skeleton law: the shapeId must be one of the NINE frozen shapes; the leg sequence non-empty over the pinned 8 kinds", () => {
    expect(() =>
      deriveRouteHypothesis(hypothesisInput({ citedShapeSkeleton: { shapeId: "not-a-frozen-shape", legKindSequence: ["FIAT_PSP_COLLECT"] } as never })),
    ).toThrow(RouteHypothesisError);
    expect(() =>
      deriveRouteHypothesis(hypothesisInput({ citedShapeSkeleton: { shapeId: "provider-native-bridge", legKindSequence: [] } as never })),
    ).toThrow(RouteHypothesisError);
    expect(() =>
      deriveRouteHypothesis(hypothesisInput({ citedShapeSkeleton: { shapeId: "provider-native-bridge", legKindSequence: ["NOT_A_LEG_KIND"] } as never })),
    ).toThrow(RouteHypothesisError);
  });

  it("the unbound re-run port fails CLOSED (the typed error + the stage in the details); a non-port is rejected", () => {
    const unbound = unboundPlannerReRunPort();
    expect(() => unbound.compileCorridorView(assumedRailView())).toThrow(PortUnboundError);
    try {
      unbound.compileCorridorView(assumedRailView());
      expect.unreachable("the unbound port must throw");
    } catch (error) {
      expect((error as PortUnboundError & { details?: unknown }).details).toEqual({ stage: ROUTE_HYPOTHESIS_STAGE });
    }
    expect(() => requirePlannerReRunPort(null)).toThrow(PortUnboundError);
    expect(() => requirePlannerReRunPort({})).toThrow(PortUnboundError);
  });

  it("a lying re-run port never composes: duplicate plan ids and malformed exclusions are the typed error", () => {
    expect(() =>
      deriveRouteHypothesis(hypothesisInput({ reRunPort: stubReRun(["plan:a", "plan:a"], []) })),
    ).toThrow(RouteHypothesisError);
    expect(() =>
      deriveRouteHypothesis(hypothesisInput({ reRunPort: stubReRun(["plan:a"], [{ side: "MERCHANT" as never, routeId: "r", code: "C", message: "m" }]) })),
    ).toThrow(RouteHypothesisError);
  });

  it("the operator law: the derivation's operatorId must match the hypothetical view's operator", () => {
    expect(() => deriveRouteHypothesis(hypothesisInput({ operatorId: "repair:someone-else" }))).toThrow(RouteHypothesisError);
  });

  it("the determinism law: identical inputs produce byte-identical hypotheses (the digest proof)", () => {
    const first: PinnedRouteHypothesis = deriveRouteHypothesis(hypothesisInput());
    const second: PinnedRouteHypothesis = deriveRouteHypothesis(hypothesisInput());
    expect(second.hypothesisDigest).toBe(first.hypothesisDigest);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("the hypothetical view must be genuine (the stage re-validates its input shape)", () => {
    expect(() =>
      deriveRouteHypothesis(hypothesisInput({ view: { variantId: "" } as never })),
    ).toThrow(RouteHypothesisError);
  });
});
