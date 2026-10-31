/**
 * PaySwap Desktop (P22-D, ADR-0016 D5/D10/D12 — the corridor bridge
 * battery) — the CORRIDOR PLAN module: the REAL compiler over the
 * pinned corridor fixtures (the planning tier — the corridor's
 * compilation lives here, never in the channel's declared test
 * corridor), the compiled plan's presentation through the REAL
 * leg-law projection, and the derivation of the dispatch
 * orchestration's CorridorPlanInput + its deterministic digest.
 *
 * - THE HONEST NO-MIDDLE LAW: without the observed onchain middle the
 *   fiat pair compiles NOTHING (NO_COMPILABLE_ROUTE with the typed
 *   exclusions naming the unobserved middle — never a fabricated
 *   middle).
 * - THE FOUR-LEG SKELETON: FIAT_PSP_COLLECT → PSP_STABLECOIN_ISSUANCE
 *   → ONCHAIN_TRANSFER → OFF_RAMP_PAYOUT; the custody chain FLW payer
 *   → FLW pool → the stellar relay wallet → Paystack → the KES bank;
 *   the exact conversions 1,000.00 GHS → 125 USDC → 16,125.00 KES.
 * - THE PRESENTATION: the REAL corridorPlanProjection over the
 *   compiled plan (fail-closed — a non-corridor shape yields nothing).
 * - THE DISPATCH INPUT: the compiled plan's own custody/lane/amount
 *   facts become the CorridorPlanInput legs (the pinned skeleton law
 *   validated); the digest is deterministic and covers every leg.
 */

import { describe, expect, it } from "vitest";

import { assertCustodyContinuity, compileMoneyMovementRoute } from "@payswap/route-compiler";
import { corridorPlanPresentationOf } from "../../src/renderer/src/corridorPlanProjection.js";
import {
  corridorPlanDigest,
  validateCorridorPlanShape,
  type CorridorPlanInput,
  type CorridorPlanLegInput,
} from "../../src/host/payswap/payments/corridor-dispatch.js";
import {
  CORRIDOR_KES_BANK_EXTERNAL_REF,
  CORRIDOR_OFFRAMP_PROVIDER,
  CORRIDOR_ONRAMP_PROVIDER,
  CORRIDOR_PAYSTACK_RECEIVING_G,
  CORRIDOR_RELAY_ACCOUNT_G,
  CORRIDOR_USDC_ASSET_ID,
  corridorCompilerInput,
  corridorLocationObservations,
  route5Intent,
  STELLAR_CHAIN_KEY,
} from "../../../route-compiler/test/corridor-fixtures.ts";

/** The issuance vehicle's pinned plan refs (the Soroban deploy — ADR-0016 D4). */
export const CORRIDOR_DEPLOY_SOURCE_HASH = "src_p22_hash_0001";
export const CORRIDOR_DEPLOY_BYTECODE_HASH = "wasm_p22_hash_0001";

/** The compiled plan type (the compiler's own RoutePlan). */
type CompiledPlan = ReturnType<typeof compileCorridorPlan>;

function compileCorridorPlan() {
  const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
  if (result.status !== "ROUTES_COMPILED" || result.plans[0] === undefined) {
    throw new Error("the corridor compile must produce the pinned plan");
  }
  return result.plans[0];
}

/**
 * The custody destination reference of a compiled leg (its own to-party
 * facts, following the compiler's custody-id law: wallets by accountRef,
 * providers by accountRef-else-name, banks by externalRef).
 */
function custodyRefOf(leg: CompiledPlan["legs"][number]): string {
  const to = leg.custody.to;
  if (to.kind === "EXTERNAL_BANK_INSTRUMENT") {
    return to.externalRef;
  }
  if (to.kind === "ONCHAIN_WALLET") {
    return to.accountRef;
  }
  if (to.kind === "MERCHANT_BALANCE") {
    return to.merchantAccountRef;
  }
  if (to.kind === "ONCHAIN_PROTOCOL") {
    return `${to.protocolKey}@${to.chainKey}`;
  }
  if (to.kind === "EXTERNAL_PROVIDER") {
    return to.accountRef ?? `provider:${to.providerName}`;
  }
  const unexpected: never = to;
  throw new Error(`the corridor leg ${String(leg.hopIndex)} carries an unexpected custody to-party (${String(unexpected)})`);
}

/** The leg's grounded amount (an UNGROUNDED leg is never a dispatch input). */
function groundedAmountOf(leg: CompiledPlan["legs"][number]): { currency: string; minorUnits: string } {
  const planned = leg.plannedAmount;
  if (planned.basis === "UNKNOWN") {
    throw new Error(
      `the corridor leg ${String(leg.hopIndex)} carries an UNGROUNDED amount (${planned.reason}) — never a dispatch input`,
    );
  }
  return planned.amount;
}

/** Derive the dispatch orchestration's plan input from the COMPILED plan's own facts. */
export function corridorPlanInputOf(plan: CompiledPlan): CorridorPlanInput {
  const [collect, issuance, relay, payout] = plan.legs;
  if (collect === undefined || issuance === undefined || relay === undefined || payout === undefined) {
    throw new Error("the compiled corridor plan must carry exactly four legs");
  }
  const legs: readonly CorridorPlanLegInput[] = [
    {
      legIndex: 0,
      legKind: "FIAT_PSP_COLLECT",
      lane: { kind: "PROVIDER", id: CORRIDOR_ONRAMP_PROVIDER },
      plannedAmount: groundedAmountOf(collect),
      destinationRef: custodyRefOf(collect),
    },
    {
      legIndex: 1,
      legKind: "PSP_STABLECOIN_ISSUANCE",
      lane: { kind: "ONCHAIN_CHAIN", id: STELLAR_CHAIN_KEY },
      plannedAmount: groundedAmountOf(issuance),
      destinationRef: custodyRefOf(issuance),
      assetRef: CORRIDOR_USDC_ASSET_ID,
      deploy: { sourceHash: CORRIDOR_DEPLOY_SOURCE_HASH, bytecodeHash: CORRIDOR_DEPLOY_BYTECODE_HASH },
    },
    {
      legIndex: 2,
      legKind: "ONCHAIN_TRANSFER",
      lane: { kind: "ONCHAIN_CHAIN", id: STELLAR_CHAIN_KEY },
      plannedAmount: groundedAmountOf(relay),
      destinationRef: custodyRefOf(relay),
      assetRef: CORRIDOR_USDC_ASSET_ID,
    },
    {
      legIndex: 3,
      legKind: "OFF_RAMP_PAYOUT",
      lane: { kind: "PROVIDER", id: CORRIDOR_OFFRAMP_PROVIDER },
      plannedAmount: groundedAmountOf(payout),
      destinationRef: custodyRefOf(payout),
    },
  ];
  return { shapeId: "cross-provider-corridor", legs };
}

/** The whole compiled-and-derived corridor journey plan (every law asserted). */
export function compileCorridorForJourney(): {
  readonly plan: CompiledPlan;
  readonly planInput: CorridorPlanInput;
  readonly digest: string;
} {
  const plan = compileCorridorPlan();
  const planInput = corridorPlanInputOf(plan);
  validateCorridorPlanShape(planInput);
  return { plan, planInput, digest: corridorPlanDigest(planInput) };
}

describe("the corridor plan module (the REAL compiler over the pinned fixtures — the planning tier)", () => {
  it("THE HONEST NO-MIDDLE LAW: without the observed middle the fiat pair compiles NOTHING (the typed exclusions name it)", () => {
    const result = compileMoneyMovementRoute(
      corridorCompilerInput(route5Intent(), {
        locationObservations: corridorLocationObservations({ withoutMiddle: true }),
      }),
    );
    expect(result.status).toBe("NO_COMPILABLE_ROUTE");
    expect(result.plans).toEqual([]);
    const reasons = result.exclusions.map((exclusion) => `${exclusion.shapeId}: ${exclusion.reasons.join(" ")}`).join(" | ");
    expect(reasons).toContain("OBSERVED onchain middle");
    expect(reasons).toContain("never a fabricated middle");
  });

  it("THE FOUR-LEG SKELETON + the custody chain + the exact conversions (the compiled plan's own facts)", () => {
    const plan = compileCorridorPlan();
    expect(plan.shapeId).toBe("cross-provider-corridor");
    expect(plan.legs.map((leg) => leg.legKind)).toEqual([
      "FIAT_PSP_COLLECT",
      "PSP_STABLECOIN_ISSUANCE",
      "ONCHAIN_TRANSFER",
      "OFF_RAMP_PAYOUT",
    ]);
    expect(plan.legs.map((leg) => leg.hopIndex)).toEqual([0, 1, 2, 3]);
    expect(plan.environmentClasses).toEqual([STELLAR_CHAIN_KEY]);
    expect(() => assertCustodyContinuity(plan.legs.map((leg) => leg.custody))).not.toThrow();
    expect(custodyRefOf(plan.legs[1]!)).toBe(CORRIDOR_RELAY_ACCOUNT_G);
    expect(custodyRefOf(plan.legs[2]!)).toBe(CORRIDOR_PAYSTACK_RECEIVING_G);
    expect(custodyRefOf(plan.legs[3]!)).toBe(CORRIDOR_KES_BANK_EXTERNAL_REF);
    expect(groundedAmountOf(plan.legs[0]!)).toEqual({ currency: "GHS", minorUnits: "100000" });
    expect(groundedAmountOf(plan.legs[1]!)).toEqual({ currency: "USDC", minorUnits: "125000000" });
    expect(groundedAmountOf(plan.legs[2]!)).toEqual({ currency: "USDC", minorUnits: "125000000" });
    expect(groundedAmountOf(plan.legs[3]!)).toEqual({ currency: "KES", minorUnits: "1612500" });
    // The compile NEVER permits execution by discovery alone (the composite
    // act is the only path — the D12 structural false).
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
    expect(result.discoveryPermitsExecution).toBe(false);
  });

  it("THE PRESENTATION through the REAL leg-law projection (fail-closed; the people language derived)", () => {
    const plan = compileCorridorPlan();
    const presentation = corridorPlanPresentationOf(plan, {
      sourceCurrency: "GHS",
      destinationCurrency: "KES",
    });
    expect(presentation).toBeDefined();
    if (presentation === undefined) return;
    expect(presentation.shapeId).toBe("cross-provider-corridor");
    expect(presentation.legCount).toBe(4);
    expect(presentation.directionClass).toBe("CONVERT");
    expect(presentation.relayChainKey).toBe(STELLAR_CHAIN_KEY);
    expect(presentation.relayAssetRef).toBe(CORRIDOR_USDC_ASSET_ID);
    expect(presentation.fundingMethod).toBe("flutterwave_ghs_mobile_money");
    expect(presentation.payoutMethod).toBe("paystack_kes_bank_transfer");
    expect(presentation.custodyChain).toHaveLength(5);
    // FAIL-CLOSED: a broken skeleton yields NO projection (never a
    // fabricated corridor card).
    const broken = compileCorridorPlan();
    expect(
      corridorPlanPresentationOf(
        { ...broken, legs: broken.legs.slice(0, 3) } as never,
        { sourceCurrency: "GHS", destinationCurrency: "KES" },
      ),
    ).toBeUndefined();
  });

  it("THE DISPATCH INPUT + THE DIGEST: the derived plan validates; the digest is deterministic and covers every leg", () => {
    const first = compileCorridorForJourney();
    const second = compileCorridorForJourney();
    expect(second.digest).toBe(first.digest);
    expect(first.digest).toMatch(/^pmt-plan-digest:[0-9a-f]{8}$/);
    expect(first.planInput.legs.map((leg) => leg.lane.kind)).toEqual([
      "PROVIDER",
      "ONCHAIN_CHAIN",
      "ONCHAIN_CHAIN",
      "PROVIDER",
    ]);
    expect(first.planInput.legs[1]?.deploy).toEqual({
      sourceHash: CORRIDOR_DEPLOY_SOURCE_HASH,
      bytecodeHash: CORRIDOR_DEPLOY_BYTECODE_HASH,
    });
    // A material change to ANY leg changes the digest (the tamper law).
    const tampered: CorridorPlanInput = {
      ...first.planInput,
      legs: first.planInput.legs.map((leg, index) =>
        index === 3 ? { ...leg, plannedAmount: { ...leg.plannedAmount, minorUnits: "9999999" } } : leg,
      ),
    };
    expect(corridorPlanDigest(tampered)).not.toBe(first.digest);
  });
});
