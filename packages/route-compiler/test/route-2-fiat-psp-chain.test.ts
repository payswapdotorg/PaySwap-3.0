import { describe, expect, it } from "vitest";
import { compileBase, planOf, baseCompilerInput } from "./compiler-fixtures.ts";
import { walkRoutePlan } from "../src/route-walk.ts";
import { assertCustodyContinuity } from "../src/custody.ts";
import { compileMoneyMovementRoute } from "../src/compiler.ts";
import { PSP_PROVIDER, NOW, route2Intent, routeLocationObservations } from "./fixtures.ts";

/**
 * Route family 2 (PORT of the old route-2 suite): provider account ->
 * onchain recipient through the PSP collect + issuance + delivery.
 */
describe("route 2: fiat -> PSP -> chain", () => {
  it("compiles the 3-hop mixed plan and the provider-native baseline", () => {
    const result = compileBase(route2Intent());
    const mixed = planOf(result, "mixed-psp-onramp");
    expect(mixed.legs.map((leg) => leg.legKind)).toEqual([
      "FIAT_PSP_COLLECT",
      "PSP_STABLECOIN_ISSUANCE",
      "ONCHAIN_TRANSFER",
    ]);
    expect(mixed.executionMode).toBe("COMPOSED_PAYSWAP");
    const baseline = planOf(result, "provider-native-onramp");
    expect(baseline.legs.map((leg) => leg.legKind)).toEqual(["FIAT_PSP_COLLECT", "PSP_STABLECOIN_ISSUANCE"]);
    expect(baseline.isProviderNativeBaseline).toBe(true);
  });

  it("the custody chain: provider account -> provider pool -> issuer protocol -> recipient wallet", () => {
    const result = compileBase(route2Intent());
    for (const plan of result.plans) {
      expect(() => assertCustodyContinuity(plan.legs.map((leg) => leg.custody))).not.toThrow();
    }
    const mixed = planOf(result, "mixed-psp-onramp");
    const [collect, issuance, delivery] = mixed.legs;
    expect(collect?.custody.from.kind).toBe("EXTERNAL_PROVIDER");
    if (collect?.custody.from.kind === "EXTERNAL_PROVIDER") {
      expect(collect.custody.from.providerName).toBe(PSP_PROVIDER);
    }
    expect(collect?.custody.to.kind).toBe("EXTERNAL_PROVIDER");
    expect(issuance?.custody.via?.kind).toBe("ONCHAIN_PROTOCOL");
    if (issuance?.custody.via?.kind === "ONCHAIN_PROTOCOL") {
      expect(issuance.custody.via.protocolKey).toBe("stablecoin-issuer:usc");
    }
    expect(delivery?.custody.to.kind).toBe("ONCHAIN_WALLET");
  });

  it("the conversion is exact: 100.00 EUR -> 108,000,000 USC minor units exactly (no rounding drift)", () => {
    const mixed = planOf(compileBase(route2Intent()), "mixed-psp-onramp");
    const issuance = mixed.legs[1];
    if (issuance?.plannedAmount.basis !== "CONVERSION_GROUNDED") {
      throw new Error("the issuance leg must be conversion-grounded");
    }
    expect(issuance.plannedAmount.amount.currency).toBe("USC");
    expect(issuance.plannedAmount.amount.minorUnits).toBe("108000000");
    expect(issuance.plannedAmount.ruleId).toBe("rule:eur-usc");
  });

  it("the collect leg carries the intent's declared amount (INTENT_DECLARED)", () => {
    const mixed = planOf(compileBase(route2Intent()), "mixed-psp-onramp");
    const collect = mixed.legs[0];
    if (collect?.plannedAmount.basis !== "INTENT_DECLARED") {
      throw new Error("the collect leg must carry the intent's declared amount");
    }
    expect(collect.plannedAmount.amount.minorUnits).toBe("10000");
  });

  it("provider-owned finality for the fiat legs; finality never assumed", () => {
    const mixed = planOf(compileBase(route2Intent()), "mixed-psp-onramp");
    for (const leg of mixed.legs) {
      expect(leg.finality.finalityNeverAssumed).toBe(true);
    }
    expect(mixed.legs[0]?.finality.candidates[0]?.model).toBe("PROVIDER_OWNED");
    expect(mixed.legs[2]?.finality.candidates[0]?.model).toBe("PROBABILISTIC");
  });

  it("the happy walk completes with custody at the recipient wallet", () => {
    const plan = planOf(compileBase(route2Intent()), "mixed-psp-onramp");
    const walk = walkRoutePlan({ plan, at: NOW, observedAtIso: "2026-10-03T00:00:01Z" });
    expect(walk.status).toBe("ROUTE_COMPLETED_ALL_LEGS_OBSERVED");
    expect(walk.custodyAtStop?.party.kind).toBe("ONCHAIN_WALLET");
  });

  it("honest exclusion when the delivery hint is absent (custody destinations are never guessed)", () => {
    const input = baseCompilerInput(route2Intent());
    const { onrampDeliveryAccount, ...hints } = input.routingHints ?? {};
    void onrampDeliveryAccount;
    const compiled = compileMoneyMovementRoute({ ...input, routingHints: hints });
    expect(compiled.plans.map((plan) => plan.shapeId)).not.toContain("mixed-psp-onramp");
    expect(
      compiled.exclusions.some(
        (exclusion) => exclusion.shapeId === "mixed-psp-onramp" && exclusion.reasons.some((reason) => reason.includes("never guessed")),
      ),
    ).toBe(true);
  });

  it("a stale origin observation yields an INELIGIBLE_CANDIDATE with the honest grounding failure", () => {
    const input = baseCompilerInput(route2Intent());
    const staled = routeLocationObservations(route2Intent()).map((observation) =>
      observation.observationKind === "PROVIDER_ACCOUNT"
        ? { ...observation, freshness: { asOf: "2026-10-02T00:00:00Z", maxAgeSeconds: 60 } }
        : observation,
    );
    const compiled = compileMoneyMovementRoute({ ...input, locationObservations: staled, assetObservations: staled });
    const mixed = compiled.plans.find((plan) => plan.shapeId === "mixed-psp-onramp");
    expect(mixed?.candidateStatus).toBe("INELIGIBLE_CANDIDATE");
    expect(mixed?.ineligibilityReasons.some((reason) => reason.code === "LEG_GROUNDING_FAILURE")).toBe(true);
    expect(compiled.status).toBe("ROUTES_COMPILED");
  });

  it("the compiled plans are emitted in canonical planId order (deterministic)", () => {
    const result = compileBase(route2Intent());
    const planIds = result.plans.map((plan) => plan.planId);
    expect([...planIds].sort()).toEqual(planIds);
  });

  it("the native-flow evidence names the incumbent provider", () => {
    const baseline = planOf(compileBase(route2Intent()), "provider-native-onramp");
    expect(baseline.legs[0]?.evidenceRefs).toContain(`native-flow:${PSP_PROVIDER}`);
  });
});
