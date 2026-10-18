import { describe, expect, it } from "vitest";
import { compileBase, planOf, baseCompilerInput } from "./compiler-fixtures.ts";
import { walkRoutePlan } from "../src/route-walk.ts";
import { validateMerchantSettlementEligibility, MERCHANT_SETTLEMENT_AUTHORITY } from "../src/merchant-legs.ts";
import { compileMoneyMovementRoute } from "../src/compiler.ts";
import { merchantEligibilityEvidence } from "./merchant-fixtures.ts";
import { NOW, route4Intent, MERCHANT_ACCOUNT_REF, MERCHANT_PROVIDER } from "./fixtures.ts";

/**
 * Route family 4 (ADAPT of the old route-4 suite onto the
 * provider-neutral merchant law): onchain wallet -> merchant balance —
 * the native settlement baseline (Mode A) and the external route with
 * the honest native-unavailable marker (Mode B).
 */
describe("route 4 Mode A: the provider-native merchant settlement (the baseline)", () => {
  it("compiles only on provider-verified eligibility (provider-verified-effects law)", () => {
    const result = compileBase(route4Intent());
    const native = planOf(result, "merchant-native-settlement");
    expect(native.legs.map((leg) => leg.legKind)).toEqual(["MERCHANT_BALANCE_SETTLEMENT"]);
    expect(native.legs[0]?.legKind).toBe("MERCHANT_BALANCE_SETTLEMENT");
    expect(native.legs[0]?.authorizationLineage.legAuthorization.kind).toBe(
      "PROVIDER_VERIFIED_SETTLEMENT_ELIGIBILITY",
    );
  });

  it("the single leg settles to the merchant balance via the provider, with the honest awaiting authority", () => {
    const native = planOf(compileBase(route4Intent()), "merchant-native-settlement");
    const leg = native.legs[0];
    expect(leg?.custody.to.kind).toBe("MERCHANT_BALANCE");
    if (leg?.custody.to.kind === "MERCHANT_BALANCE") {
      expect(leg.custody.to.merchantAccountRef).toBe(MERCHANT_ACCOUNT_REF);
    }
    expect(leg?.custody.via?.kind).toBe("EXTERNAL_PROVIDER");
    if (leg?.custody.via?.kind === "EXTERNAL_PROVIDER") {
      expect(leg.custody.via.providerName).toBe(MERCHANT_PROVIDER);
    }
    if (leg?.authorizationLineage.legAuthorization.kind === "PROVIDER_VERIFIED_SETTLEMENT_ELIGIBILITY") {
      expect(leg.authorizationLineage.legAuthorization.evidenceId).toBe("merchant-eligibility:001");
      expect(leg.authorizationLineage.legAuthorization.awaitingAuthority).toBe(MERCHANT_SETTLEMENT_AUTHORITY);
    }
  });

  it("excluded when the eligibility evidence is stale (honest exclusion, never fabricated)", () => {
    const input = baseCompilerInput(route4Intent(), {
      merchantEligibility: [
        merchantEligibilityEvidence({ asOf: "2026-10-02T00:00:00Z", maxAgeSeconds: 60 }),
      ],
    });
    const compiled = compileMoneyMovementRoute(input);
    expect(compiled.plans.map((plan) => plan.shapeId)).not.toContain("merchant-native-settlement");
    expect(
      compiled.exclusions.some(
        (exclusion) => exclusion.shapeId === "merchant-native-settlement" && exclusion.reasons.some((r) => r.includes("provider-verified")),
      ),
    ).toBe(true);
  });

  it("excluded when the evidence currency mismatches the destination", () => {
    const input = baseCompilerInput(route4Intent(), {
      merchantEligibility: [merchantEligibilityEvidence({ currency: "EUR" })],
    });
    const compiled = compileMoneyMovementRoute(input);
    expect(compiled.plans.map((plan) => plan.shapeId)).not.toContain("merchant-native-settlement");
  });

  it("the eligibility evidence validator enforces the rule-30 literals (providerVerified, eligible)", () => {
    expect(() =>
      validateMerchantSettlementEligibility({ ...merchantEligibilityEvidence(), eligible: false as never }),
    ).toThrowError(/ineligibility is surfaced as an honest exclusion/);
    expect(() =>
      validateMerchantSettlementEligibility({ ...merchantEligibilityEvidence(), providerVerified: false as never }),
    ).toThrowError(/provider-verified effect demands provider verification/);
    expect(() =>
      validateMerchantSettlementEligibility({ ...merchantEligibilityEvidence(), awaitingAuthority: "P4-W1-003" as never }),
    ).toThrowError(/awaitingAuthority/);
  });

  it("the walk reaches a provider-verified settlement observation (SUCCESS)", () => {
    const native = planOf(compileBase(route4Intent()), "merchant-native-settlement");
    const walk = walkRoutePlan({ plan: native, at: NOW, observedAtIso: "2026-10-03T00:00:01Z" });
    expect(walk.status).toBe("ROUTE_COMPLETED_ALL_LEGS_OBSERVED");
    expect(walk.custodyAtStop?.party.kind).toBe("MERCHANT_BALANCE");
  });
});

describe("route 4 Mode B: the external route (the honest native-unavailable marker)", () => {
  it("carries the mandated notice with the reason and the awaiting authority", () => {
    const result = compileBase(route4Intent());
    const external = planOf(result, "merchant-external-payswap-route");
    expect(external.merchantNativeSettlementUnavailable?.notice).toBe(
      "native merchant-balance settlement unavailable for this route",
    );
    expect(external.merchantNativeSettlementUnavailable?.awaitingAuthority).toBe("P5-W3");
    expect(external.merchantNativeSettlementUnavailable?.reason).toContain("never a synthetic merchant balance effect");
  });

  it("is the off-ramp shape (swap -> deposit -> payout -> bank) settling to the merchant's bank destination", () => {
    const external = planOf(compileBase(route4Intent()), "merchant-external-payswap-route");
    expect(external.legs.map((leg) => leg.legKind)).toEqual([
      "ONCHAIN_DEX_SWAP",
      "ONCHAIN_TRANSFER",
      "OFF_RAMP_PAYOUT",
      "BANK_SETTLEMENT",
    ]);
    expect(external.candidateStatus).toBe("EXECUTABLE_CANDIDATE");
    const bank = external.legs[3];
    expect(bank?.custody.to.kind).toBe("EXTERNAL_BANK_INSTRUMENT");
  });

  it("still compiles when the eligibility evidence is absent (the external route is the fallback)", () => {
    const input = baseCompilerInput(route4Intent(), { merchantEligibility: [] });
    const compiled = compileMoneyMovementRoute(input);
    expect(compiled.plans.map((plan) => plan.shapeId)).toContain("merchant-external-payswap-route");
    expect(compiled.plans.map((plan) => plan.shapeId)).not.toContain("merchant-native-settlement");
  });

  it("the merchant MERCHANT_OUTCOME_UNKNOWN fault requires reconciliation (INV-X01/X03)", () => {
    const native = planOf(compileBase(route4Intent()), "merchant-native-settlement");
    const walk = walkRoutePlan({
      plan: native,
      at: NOW,
      observedAtIso: "2026-10-03T00:00:01Z",
      faults: {
        [native.legs[0]?.legId ?? ""]: { kind: "MERCHANT_OUTCOME_UNKNOWN", reason: "the fixture verification outcome is unknown" },
      },
    });
    expect(walk.status).toBe("ROUTE_REQUIRES_RECONCILIATION");
    expect(walk.reconciliation?.resolver).toBe("SETTLEMENT_RECONCILIATION_AUTHORITY");
    expect(walk.legExecutions[0]?.status).toBe("OUTCOME_UNKNOWN");
    expect(walk.legExecutions[0]?.unknownReason).toContain("verification");
  });
});
