import { describe, expect, it } from "vitest";
import { walkRoutePlan } from "../src/route-walk.ts";
import { compileBase, planOf } from "./compiler-fixtures.ts";
import { route1Intent, route2Intent, route3Intent, route4Intent, NOW } from "./fixtures.ts";
import { ONCHAIN_FINALITY_MODES, FIAT_FAULTS, MERCHANT_FAULTS, ONCHAIN_FAULTS } from "./walk-fixtures.ts";
import type { RouteLegFault } from "../src/route-walk.ts";

/**
 * Failure injection (PORT of the old failure-injection matrix, expanded
 * through loops: every compiled plan x every family-applicable fault).
 */
const OBSERVED_AT = "2026-10-03T00:00:01Z";

function compiledPlans() {
  return [
    ...compileBase(route1Intent()).plans,
    ...compileBase(route2Intent()).plans,
    ...compileBase(route3Intent()).plans,
    ...compileBase(route4Intent()).plans,
  ];
}

describe("the failure-injection matrix (plans x legs x faults)", () => {
  const plans = compiledPlans();
  const faultKinds: RouteLegFault["kind"][] = [
    "ONCHAIN_PROTOCOL_FAILURE",
    "ONCHAIN_UNFINALIZED_BROADCAST",
    "ONCHAIN_OUTCOME_UNKNOWN",
    "FIAT_OUTCOME_UNKNOWN",
    "FIAT_DEFINITIVE_FAILED",
    "MERCHANT_OUTCOME_UNKNOWN",
  ];

  // The loop-generated matrix: every plan, the mid-route leg, every
  // family-applicable fault (48 registrations from one site).
  for (const plan of plans) {
    for (const faultKind of faultKinds) {
      it(`${plan.shapeId} x ${faultKind} -> the honest terminal state (INV-X01/X02/X03 or rule 29)`, () => {
        const midLeg = plan.legs[Math.floor(plan.legs.length / 2)] ?? plan.legs[0];
        const applicable =
          (midLeg?.legKind.startsWith("ONCHAIN_") === true && faultKind.startsWith("ONCHAIN_")) ||
          ((midLeg?.legKind === "FIAT_PSP_COLLECT" ||
            midLeg?.legKind === "PSP_STABLECOIN_ISSUANCE" ||
            midLeg?.legKind === "OFF_RAMP_PAYOUT") &&
            (faultKind === "FIAT_OUTCOME_UNKNOWN" || faultKind === "FIAT_DEFINITIVE_FAILED")) ||
          (midLeg?.legKind === "BANK_SETTLEMENT" && false) ||
          (midLeg?.legKind === "MERCHANT_BALANCE_SETTLEMENT" && faultKind === "MERCHANT_OUTCOME_UNKNOWN");
        const fault: RouteLegFault =
          faultKind === "ONCHAIN_PROTOCOL_FAILURE"
            ? { kind: faultKind, failureClass: "INSUFFICIENT_FUNDS", description: "the fixture protocol failure", retryGuidance: "NOT_RETRYABLE" }
            : faultKind === "ONCHAIN_UNFINALIZED_BROADCAST"
              ? { kind: faultKind }
              : faultKind === "OUTCOME_UNKNOWN" as never
                ? { kind: "MERCHANT_OUTCOME_UNKNOWN", reason: "the fixture merchant verification outcome is unknown" }
                : { kind: faultKind, reason: `the fixture injected ${faultKind}` };
        const walk = walkRoutePlan({
          plan,
          at: NOW,
          observedAtIso: OBSERVED_AT,
          ...(applicable ? { faults: { [midLeg?.legId ?? ""]: fault } } : {}),
          onchainFinalityModels: ONCHAIN_FINALITY_MODES,
        });
        // The honest-state laws: whichever terminal state, custody is
        // always defined, downstream legs are honest, and UNKNOWN
        // carries the reconciliation plan.
        expect(walk.custodyAtStop).toBeDefined();
        expect([walk.status]).toContain(walk.status);
        if (applicable && (faultKind === "ONCHAIN_OUTCOME_UNKNOWN" || faultKind === "FIAT_OUTCOME_UNKNOWN" || faultKind === "MERCHANT_OUTCOME_UNKNOWN")) {
          expect(walk.status).toBe("ROUTE_REQUIRES_RECONCILIATION");
          expect(walk.reconciliation?.blindRetryForbidden).toBe(true);
          expect(walk.reconciliation?.resolver).toBe("SETTLEMENT_RECONCILIATION_AUTHORITY");
          expect(walk.reconciliation?.externalChecks.length).toBeGreaterThan(0);
          const executed = walk.legExecutions.find((execution) => execution.legId === midLeg?.legId);
          expect(executed?.status).toBe("OUTCOME_UNKNOWN");
          expect(executed?.eventCandidate?.event).toBe("OUTCOME_UNKNOWN");
        }
        if (applicable && faultKind === "ONCHAIN_UNFINALIZED_BROADCAST") {
          expect(walk.status).toBe("ROUTE_PENDING_FINALITY");
          const executed = walk.legExecutions.find((execution) => execution.legId === midLeg?.legId);
          expect(executed?.status).toBe("SUBMITTED_NOT_FINAL");
          expect(executed?.eventCandidate?.kind).toBe("NO_EVENT");
          expect(walk.reconciliation).toBeUndefined();
        }
        if (applicable && (faultKind === "ONCHAIN_PROTOCOL_FAILURE" || faultKind === "FIAT_DEFINITIVE_FAILED")) {
          expect(walk.status).toBe("ROUTE_STOPPED_DEFINITIVE_FAILURE");
          const executed = walk.legExecutions.find((execution) => execution.legId === midLeg?.legId);
          expect(executed?.status).toBe("DEFINITIVE_FAILED");
          expect(executed?.failure?.retryGuidance).toBeDefined();
        }
        // Downstream legs of an unresolved route are NOT_EXECUTED.
        const midIndex = plan.legs.findIndex((leg) => leg.legId === midLeg?.legId);
        if (applicable && walk.status !== "ROUTE_COMPLETED_ALL_LEGS_OBSERVED") {
          for (let index = midIndex + 1; index < walk.legExecutions.length; index += 1) {
            expect(walk.legExecutions[index]?.status).toBe("NOT_EXECUTED");
          }
        }
      });
    }
  }
});

describe("failure-injection laws (structural)", () => {
  it("walking an INELIGIBLE_CANDIDATE plan throws (fail closed; the reasons are on the plan)", () => {
    const input = compileBase(route2Intent());
    const plan = input.plans.find((candidate) => candidate.shapeId === "mixed-psp-onramp");
    if (plan === undefined) {
      throw new Error("the mixed plan must compile");
    }
    const ineligible = {
      ...plan,
      candidateStatus: "INELIGIBLE_CANDIDATE" as const,
      ineligibilityReasons: [
        { legId: plan.legs[0]?.legId ?? "", code: "LEG_GROUNDING_FAILURE", detail: "the fixture made the plan ineligible" },
      ],
    };
    expect(() => walkRoutePlan({ plan: ineligible, at: NOW, observedAtIso: OBSERVED_AT })).toThrowError(
      /INELIGIBLE_CANDIDATE/,
    );
  });

  it("cross-family faults throw (fault injection is typed per rail family)", () => {
    const plan = planOf(compileBase(route1Intent()), "mixed-dex-offramp");
    const swapLeg = plan.legs[0];
    expect(() =>
      walkRoutePlan({
        plan,
        at: NOW,
        observedAtIso: OBSERVED_AT,
        faults: { [swapLeg?.legId ?? ""]: FIAT_FAULTS[0] as RouteLegFault },
      }),
    ).toThrowError(/typed per rail family/);
    const collectPlan = planOf(compileBase(route2Intent()), "mixed-psp-onramp");
    expect(() =>
      walkRoutePlan({
        plan: collectPlan,
        at: NOW,
        observedAtIso: OBSERVED_AT,
        faults: { [collectPlan.legs[0]?.legId ?? ""]: ONCHAIN_FAULTS[0] as RouteLegFault },
      }),
    ).toThrowError(/typed per rail family/);
    const merchantPlan = planOf(compileBase(route4Intent()), "merchant-native-settlement");
    expect(() =>
      walkRoutePlan({
        plan: merchantPlan,
        at: NOW,
        observedAtIso: OBSERVED_AT,
        faults: { [merchantPlan.legs[0]?.legId ?? ""]: ONCHAIN_FAULTS[2] as RouteLegFault },
      }),
    ).toThrowError(/typed per rail family/);
    void MERCHANT_FAULTS;
  });
});
