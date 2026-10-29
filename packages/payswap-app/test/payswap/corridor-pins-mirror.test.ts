/**
 * Corridor pins mirror (P22-B, net-new): the app's structural corridor
 * vocabulary == the ROUTE authority (route-planning pins/corridor.ts)
 * and the PRESENTATION authority (surface corridor-plan.ts) — same
 * literals, same order, byte-identical (ADR-0016 appendix + the D11
 * merge-fidelity law). Test-only relative imports; the app src never
 * imports a @payswap/* workspace package.
 */

import { describe, expect, it } from "vitest";

import {
  CORRIDOR_PLAN_LEG_PEOPLE_LABELS_PIN,
  CORRIDOR_PLAN_STELLAR_ISSUER_STRKEY_PATTERN_PIN,
  PAYMENT_MISSIONS_COMPOSITE_ACT_NOTE,
  PINNED_CORRIDOR_DIRECTION_CLASSES,
  PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD,
  PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD,
  PINNED_CORRIDOR_LEG_OUTCOMES,
  PINNED_CORRIDOR_LEG_SKELETON,
  PINNED_CORRIDOR_RELAY_RAIL,
  PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
  PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS,
  PINNED_STELLAR_CHAIN_KEY,
} from "../../src/pins/corridor-pins.js";

import {
  CORRIDOR_PLAN_LEG_PEOPLE_LABELS as SURFACE_PEOPLE_LABELS,
  CORRIDOR_PLAN_LEG_SKELETON as SURFACE_SKELETON,
  CORRIDOR_PLAN_SHAPE_ID as SURFACE_SHAPE_ID,
  CORRIDOR_PLAN_DIRECTION_CLASSES as SURFACE_DIRECTION_CLASSES,
  CORRIDOR_PLAN_STELLAR_ISSUER_STRKEY_PATTERN as SURFACE_ISSUER_PATTERN,
  foldCorridorPlan,
} from "../../../surface/src/corridor-plan.ts";

import {
  PINNED_CORRIDOR_DIRECTION_CLASSES as RP_DIRECTIONS,
  PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD as RP_FUNDING,
  PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD as RP_PAYOUT,
  PINNED_CORRIDOR_DIRECTION_CLASSES as RP_CORRIDOR_DIRECTIONS,
  PINNED_CORRIDOR_LEG_OUTCOMES as RP_OUTCOMES,
  PINNED_CORRIDOR_LEG_SKELETON as RP_SKELETON,
  PINNED_CORRIDOR_RELAY_RAIL as RP_RELAY_RAIL,
  PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID as RP_SHAPE_ID,
  PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS as RP_HOP_BOUND,
  PINNED_STELLAR_CHAIN_KEY as RP_CHAIN_KEY,
} from "../../../route-planning/src/pins/corridor.ts";

describe("corridor pins mirror — the route authority (route-planning pins/corridor.ts)", () => {
  it("the chain key + the relay rail pin byte-identically", () => {
    expect(PINNED_STELLAR_CHAIN_KEY).toBe(RP_CHAIN_KEY);
    expect(PINNED_STELLAR_CHAIN_KEY).toBe("stellar:testnet");
    expect(PINNED_CORRIDOR_RELAY_RAIL).toEqual(RP_RELAY_RAIL);
    expect(PINNED_CORRIDOR_RELAY_RAIL).toEqual({ railKind: "ONCHAIN", railKey: "stellar:testnet" });
  });

  it("the funding/payout method pins are byte-identical (never invented twice)", () => {
    expect(PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD).toBe(RP_FUNDING);
    expect(PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD).toBe("flutterwave_ghs_mobile_money");
    expect(PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD).toBe(RP_PAYOUT);
    expect(PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD).toBe("paystack_kes_bank_transfer");
  });

  it("the direction classes + the hop bound pin byte-identically (PAY never a corridor class)", () => {
    expect([...PINNED_CORRIDOR_DIRECTION_CLASSES]).toEqual([...RP_CORRIDOR_DIRECTIONS]);
    expect([...PINNED_CORRIDOR_DIRECTION_CLASSES]).toEqual(["MOVE", "CONVERT"]);
    expect(PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS).toBe(RP_HOP_BOUND);
    expect(PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS).toBe(1);
  });

  it("the leg skeleton + the leg outcomes pin byte-identically (the four-leg law + the partial-failure terms)", () => {
    expect([...PINNED_CORRIDOR_LEG_SKELETON]).toEqual([...RP_SKELETON]);
    expect([...PINNED_CORRIDOR_LEG_SKELETON]).toEqual([
      "FIAT_PSP_COLLECT",
      "PSP_STABLECOIN_ISSUANCE",
      "ONCHAIN_TRANSFER",
      "OFF_RAMP_PAYOUT",
    ]);
    expect([...PINNED_CORRIDOR_LEG_OUTCOMES]).toEqual([...RP_OUTCOMES]);
    expect([...PINNED_CORRIDOR_LEG_OUTCOMES]).toEqual(["CONFIRMED", "UNKNOWN", "FAILED"]);
  });

  it("the corridor shape id pins byte-identically", () => {
    expect(PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID).toBe(RP_SHAPE_ID);
    expect(PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID).toBe("cross-provider-corridor");
  });
});

describe("corridor pins mirror — the presentation authority (surface corridor-plan.ts)", () => {
  it("the presentation leg kinds + people labels pin byte-identically", () => {
    expect(CORRIDOR_PLAN_LEG_PEOPLE_LABELS_PIN).toEqual(SURFACE_PEOPLE_LABELS);
    for (const legKind of ["FIAT_PSP_COLLECT", "PSP_STABLECOIN_ISSUANCE", "ONCHAIN_TRANSFER", "OFF_RAMP_PAYOUT"] as const) {
      expect(CORRIDOR_PLAN_LEG_PEOPLE_LABELS_PIN[legKind]).toBe(SURFACE_PEOPLE_LABELS[legKind]);
    }
  });

  it("the issuer StrKey pattern pins byte-identically", () => {
    expect(CORRIDOR_PLAN_STELLAR_ISSUER_STRKEY_PATTERN_PIN.source).toBe(SURFACE_ISSUER_PATTERN.source);
    expect(CORRIDOR_PLAN_STELLAR_ISSUER_STRKEY_PATTERN_PIN.flags).toBe(SURFACE_ISSUER_PATTERN.flags);
    expect(CORRIDOR_TEST_ISSUER()).toMatch(CORRIDOR_PLAN_STELLAR_ISSUER_STRKEY_PATTERN_PIN);
  });

  it("the surface skeleton/shape/directions equal the route pins (the two authorities agree)", () => {
    expect([...SURFACE_SKELETON]).toEqual([...RP_SKELETON]);
    expect(SURFACE_SHAPE_ID).toBe(RP_SHAPE_ID);
    expect([...SURFACE_DIRECTION_CLASSES]).toEqual([...RP_DIRECTIONS]);
  });

  it("the canonical corridor folds through the REAL surface authority over the pinned literals", () => {
    const issuerG = CORRIDOR_TEST_ISSUER();
    const relayAssetRef = `stellar:testnet/asset:USDC:${issuerG}`;
    const view = foldCorridorPlan({
      planId: "plan-corridor-pin-check",
      directionClass: "CONVERT",
      fundingMethod: PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD,
      payoutMethod: PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD,
      relayAssetRef,
      legs: [
        {
          lane: { kind: "PROVIDER", id: "flutterwave", label: "Flutterwave — Ghana mobile money" },
          custody: { from: "the sender's Flutterwave-collected GHS balance", to: "Flutterwave's pooled collection account" },
          prerequisites: ["the Flutterwave connection is active"],
        },
        {
          lane: { kind: "PROVIDER", id: "stripe", label: "Stripe — USDC issuance" },
          custody: { from: "Flutterwave's pooled collection account", to: "the issuance vehicle's USD settlement balance" },
          prerequisites: ["the stablecoin issuance vehicle is prepared"],
        },
        {
          lane: { kind: "ONCHAIN_CHAIN", id: PINNED_STELLAR_CHAIN_KEY, label: "Stellar testnet — USDC transfer" },
          custody: { from: "the issuance vehicle's USD settlement balance", to: "the off-ramp's Stellar receiving address" },
          assetRef: relayAssetRef,
          prerequisites: ["the Stellar testnet keypair is sealed"],
        },
        {
          lane: { kind: "PROVIDER", id: "paystack", label: "Paystack — Kenya bank transfer" },
          custody: { from: "the off-ramp's Stellar receiving address", to: "the beneficiary's KES bank account" },
          prerequisites: ["the Paystack connection is active"],
        },
      ],
    });
    expect(view.legCount).toBe(4);
    expect(view.relayChainKey).toBe(PINNED_STELLAR_CHAIN_KEY);
    expect(view.fundingMethod).toBe(RP_FUNDING);
    expect(view.payoutMethod).toBe(RP_PAYOUT);
  });
});

describe("the composite-act note (the app's honest people language)", () => {
  it("names the plan scope, the per-leg shares and the pending-reconciliation law", () => {
    expect(PAYMENT_MISSIONS_COMPOSITE_ACT_NOTE).toContain("the whole presented plan");
    expect(PAYMENT_MISSIONS_COMPOSITE_ACT_NOTE).toContain("the digest binds every leg");
    expect(PAYMENT_MISSIONS_COMPOSITE_ACT_NOTE).toContain("its own single-use share");
    expect(PAYMENT_MISSIONS_COMPOSITE_ACT_NOTE).toContain("pending-reconciliation card");
    expect(PAYMENT_MISSIONS_COMPOSITE_ACT_NOTE).toContain("never dispatches until the chain is honestly resolved");
  });
});

/** A deterministic well-formed G… issuer for the fixture (never a secret — a public account id shape). */
function CORRIDOR_TEST_ISSUER(): string {
  return "GDFQSZ5XEGJFPEYHSRTWQU3GQTL2FQZI5AZYW3EEHHIFC2T6SRDJJ7W3";
}
