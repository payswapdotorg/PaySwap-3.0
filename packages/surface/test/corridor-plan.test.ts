/**
 * Corridor plan presentation laws (P22-B, net-new): the four-leg fold —
 * the skeleton order, the custody continuity, the onchain lane law, the
 * issuer-scoped relay asset, the per-leg people-language prerequisites,
 * the disclosed leg count. Fail-closed throughout.
 */

import { describe, expect, it } from "vitest";

import {
  CORRIDOR_PLAN_DIRECTION_CLASSES,
  CORRIDOR_PLAN_LEG_PEOPLE_LABELS,
  CORRIDOR_PLAN_LEG_SKELETON,
  CORRIDOR_PLAN_SHAPE_ID,
  InvalidCorridorPlanError,
  foldCorridorPlan,
  isIssuerScopedCorridorAssetRef,
  type CorridorPlanSource,
} from "../src/index.ts";

const ISSUER_G = "GDFQSZ5XEGJFPEYHSRTWQU3GQTL2FQZI5AZYW3EEHHIFC2T6SRDJJ7W3";
const RELAY_ASSET_REF = `stellar:testnet/asset:USDC:${ISSUER_G}`;

/** The canonical corridor source (the pinned corridor's own facts). */
function canonicalCorridorSource(): CorridorPlanSource {
  return {
    planId: "plan-corridor-001",
    directionClass: "CONVERT",
    fundingMethod: "flutterwave_ghs_mobile_money",
    payoutMethod: "paystack_kes_bank_transfer",
    relayAssetRef: RELAY_ASSET_REF,
    legs: [
      {
        lane: { kind: "PROVIDER", id: "flutterwave", label: "Flutterwave — Ghana mobile money" },
        custody: { from: "the sender's Flutterwave-collected GHS balance", to: "Flutterwave's pooled collection account" },
        prerequisites: ["the Flutterwave connection is active", "the payer's mobile-money wallet is reachable"],
      },
      {
        lane: { kind: "PROVIDER", id: "stripe", label: "Stripe — USDC issuance" },
        custody: { from: "Flutterwave's pooled collection account", to: "the issuance vehicle's USD settlement balance" },
        prerequisites: ["the stablecoin issuance vehicle is prepared"],
      },
      {
        lane: { kind: "ONCHAIN_CHAIN", id: "stellar:testnet", label: "Stellar testnet — USDC transfer" },
        custody: { from: "the issuance vehicle's USD settlement balance", to: "the off-ramp's Stellar receiving address" },
        assetRef: RELAY_ASSET_REF,
        prerequisites: ["the Stellar testnet keypair is sealed", "the sending account holds the issuer-scoped USDC"],
      },
      {
        lane: { kind: "PROVIDER", id: "paystack", label: "Paystack — Kenya bank transfer" },
        custody: { from: "the off-ramp's Stellar receiving address", to: "the beneficiary's KES bank account" },
        prerequisites: ["the Paystack connection is active", "the beneficiary bank instrument is verified"],
      },
    ],
  };
}

describe("corridor plan presentation (P22-B)", () => {
  it("folds the canonical corridor: leg count 4, skeleton order, custody chain of 5, issuer-scoped relay asset", () => {
    const view = foldCorridorPlan(canonicalCorridorSource());
    expect(view.shapeId).toBe(CORRIDOR_PLAN_SHAPE_ID);
    expect(view.shapeId).toBe("cross-provider-corridor");
    expect(view.legCount).toBe(4);
    expect(view.legs.map((leg) => leg.legKind)).toEqual([
      "FIAT_PSP_COLLECT",
      "PSP_STABLECOIN_ISSUANCE",
      "ONCHAIN_TRANSFER",
      "OFF_RAMP_PAYOUT",
    ]);
    expect(view.legs.map((leg) => leg.legIndex)).toEqual([0, 1, 2, 3]);
    expect(view.custodyChain).toHaveLength(5);
    expect(view.custodyChain[0]).toBe("the sender's Flutterwave-collected GHS balance");
    expect(view.custodyChain[4]).toBe("the beneficiary's KES bank account");
    expect(view.relayAssetRef).toBe(RELAY_ASSET_REF);
    expect(view.relayChainKey).toBe("stellar:testnet");
    expect(view.fundingMethod).toBe("flutterwave_ghs_mobile_money");
    expect(view.payoutMethod).toBe("paystack_kes_bank_transfer");
  });

  it("the leg kinds are DERIVED from the skeleton index — the people labels are the frozen vocabulary", () => {
    const view = foldCorridorPlan(canonicalCorridorSource());
    expect(CORRIDOR_PLAN_LEG_SKELETON).toEqual([
      "FIAT_PSP_COLLECT",
      "PSP_STABLECOIN_ISSUANCE",
      "ONCHAIN_TRANSFER",
      "OFF_RAMP_PAYOUT",
    ]);
    for (const leg of view.legs) {
      expect(leg.peopleLabel).toBe(CORRIDOR_PLAN_LEG_PEOPLE_LABELS[leg.legKind]);
    }
    const onchainLeg = view.legs[2];
    if (onchainLeg === undefined) throw new Error("fixture: onchain leg absent");
    expect(onchainLeg.peopleLabel).toBe(
      "Transfer the stablecoin onchain to the off-ramp's receiving address",
    );
  });

  it("the outcome line discloses the leg count and the custody points (people language)", () => {
    const view = foldCorridorPlan(canonicalCorridorSource());
    expect(view.outcomeLine).toContain("4-leg cross-provider corridor plan (CONVERT)");
    expect(view.outcomeLine).toContain("5 named points");
    expect(view.outcomeLine).toContain("issuer-scoped stablecoin");
    expect(view.outcomeLine).toContain("The leg count is disclosed, never hidden.");
  });

  it("the provenance carries the surface API version and the P22-B work order", () => {
    const view = foldCorridorPlan(canonicalCorridorSource());
    expect(view.provenance.workOrder).toBe("P22-B");
    expect(view.provenance.surfaceApiVersion).toBe("1.6.0");
  });

  it("refuses a plan whose legs are not exactly the frozen four (too few and too many)", () => {
    const short = canonicalCorridorSource();
    (short as { legs: unknown }).legs = short.legs.slice(0, 3);
    expect(() => foldCorridorPlan(short)).toThrow(InvalidCorridorPlanError);
    expect(() => foldCorridorPlan(short)).toThrow(/exactly 4 legs/);

    const long = canonicalCorridorSource();
    (long as { legs: unknown }).legs = [...long.legs, long.legs[3]];
    expect(() => foldCorridorPlan(long)).toThrow(/exactly 4 legs/);
  });

  it("refuses a PAY direction class — a corridor is never a direct payment", () => {
    const source = canonicalCorridorSource();
    (source as { directionClass: unknown }).directionClass = "PAY";
    expect(() => foldCorridorPlan(source)).toThrow(InvalidCorridorPlanError);
    expect(() => foldCorridorPlan(source)).toThrow(/never a direct payment/);
    expect(CORRIDOR_PLAN_DIRECTION_CLASSES).toEqual(["MOVE", "CONVERT"]);
  });

  it("refuses a custody discontinuity — the chain never silently breaks", () => {
    const source = canonicalCorridorSource();
    (source.legs[2] as { custody: unknown }).custody = {
      from: "a point that is NOT the issuance vehicle's settlement balance",
      to: "the off-ramp's Stellar receiving address",
    };
    expect(() => foldCorridorPlan(source)).toThrow(InvalidCorridorPlanError);
    expect(() => foldCorridorPlan(source)).toThrow(/custody is discontinuous at leg 2/);
  });

  it("refuses an onchain leg that rides a PROVIDER lane, and a provider leg that rides an ONCHAIN_CHAIN lane", () => {
    const onchainAsProvider = canonicalCorridorSource();
    const onchainLane = onchainAsProvider.legs[2]?.lane as { kind: unknown } | undefined;
    if (onchainLane !== undefined) onchainLane.kind = "PROVIDER";
    expect(() => foldCorridorPlan(onchainAsProvider)).toThrow(/onchain leg \(leg 2\) must ride an ONCHAIN_CHAIN lane/);

    const providerAsOnchain = canonicalCorridorSource();
    const collectLane = providerAsOnchain.legs[0]?.lane as { kind: unknown } | undefined;
    if (collectLane !== undefined) collectLane.kind = "ONCHAIN_CHAIN";
    expect(() => foldCorridorPlan(providerAsOnchain)).toThrow(/leg 0 \(FIAT_PSP_COLLECT\) must ride a PROVIDER lane/);
  });

  it("refuses a relay asset that is not the issuer-scoped three-segment form (the collision law)", () => {
    const bare = canonicalCorridorSource();
    (bare as { relayAssetRef: unknown }).relayAssetRef = "stellar:testnet/asset:USDC";
    expect(() => foldCorridorPlan(bare)).toThrow(InvalidCorridorPlanError);
    expect(() => foldCorridorPlan(bare)).toThrow(/issuer-scoped form/);

    const wrongIssuer = canonicalCorridorSource();
    (wrongIssuer as { relayAssetRef: unknown }).relayAssetRef = `stellar:testnet/asset:USDC:SCZANGBA5YHTNYVVV4C3U5WRNQ7C2G4X6O2L7YQ4JSDT7A5Q5GKMSOGA`;
    expect(() => foldCorridorPlan(wrongIssuer)).toThrow(/issuer-scoped form/);

    const onchainLegMismatch = canonicalCorridorSource();
    (onchainLegMismatch.legs[2] as { assetRef: unknown }).assetRef = `stellar:testnet/asset:USDC:${"G".repeat(56)}`;
    expect(() => foldCorridorPlan(onchainLegMismatch)).toThrow(
      /must carry the plan's issuer-scoped relay asset/,
    );
  });

  it("the issuer-scoped predicate admits the canonical form and refuses malformed issuers/codes", () => {
    expect(isIssuerScopedCorridorAssetRef("stellar:testnet", RELAY_ASSET_REF)).toBe(true);
    expect(isIssuerScopedCorridorAssetRef("stellar:testnet", "stellar:testnet/asset:USDC")).toBe(false);
    expect(isIssuerScopedCorridorAssetRef("stellar:testnet", `ethereum:mainnet/asset:USDC:${ISSUER_G}`)).toBe(false);
    expect(isIssuerScopedCorridorAssetRef("stellar:testnet", `stellar:testnet/asset:usdc:${ISSUER_G}`)).toBe(false);
    expect(isIssuerScopedCorridorAssetRef("stellar:testnet", `stellar:testnet/asset:USDC:${ISSUER_G.slice(0, 54)}`)).toBe(false);
    expect(isIssuerScopedCorridorAssetRef("stellar:testnet", 42)).toBe(false);
  });

  it("refuses empty per-leg prerequisites — every leg discloses its prerequisites in people language", () => {
    const source = canonicalCorridorSource();
    (source.legs[3] as { prerequisites: unknown }).prerequisites = [];
    expect(() => foldCorridorPlan(source)).toThrow(InvalidCorridorPlanError);
    expect(() => foldCorridorPlan(source)).toThrow(/leg 3 \(OFF_RAMP_PAYOUT\) must disclose at least one prerequisite/);
  });

  it("refuses empty methods, plan ids, lane ids and labels (fail-closed throughout)", () => {
    const noFunding = canonicalCorridorSource();
    (noFunding as { fundingMethod: unknown }).fundingMethod = "";
    expect(() => foldCorridorPlan(noFunding)).toThrow(/fundingMethod/);

    const noPayout = canonicalCorridorSource();
    (noPayout as { payoutMethod: unknown }).payoutMethod = " ";
    expect(() => foldCorridorPlan(noPayout)).toThrow(/payoutMethod/);

    const noPlanId = canonicalCorridorSource();
    (noPlanId as { planId: unknown }).planId = "";
    expect(() => foldCorridorPlan(noPlanId)).toThrow(/planId/);

    const noLaneId = canonicalCorridorSource();
    const issuanceLane = noLaneId.legs[1]?.lane as { id: unknown } | undefined;
    if (issuanceLane !== undefined) issuanceLane.id = "";
    expect(() => foldCorridorPlan(noLaneId)).toThrow(/leg 1: lane.id/);

    const noLaneLabel = canonicalCorridorSource();
    const collectLane2 = noLaneLabel.legs[0]?.lane as { label: unknown } | undefined;
    if (collectLane2 !== undefined) collectLane2.label = "";
    expect(() => foldCorridorPlan(noLaneLabel)).toThrow(/leg 0: lane.label/);
  });

  it("MOVE corridors fold with the same laws (the direction class is carried, not re-derived)", () => {
    const source = canonicalCorridorSource();
    (source as { directionClass: unknown }).directionClass = "MOVE";
    const view = foldCorridorPlan(source);
    expect(view.directionClass).toBe("MOVE");
    expect(view.outcomeLine).toContain("(MOVE)");
  });
});
