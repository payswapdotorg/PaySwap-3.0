import { describe, expect, it } from "vitest";
import { compileBase, planOf, baseCompilerInput } from "./compiler-fixtures.ts";
import { walkRoutePlan } from "../src/route-walk.ts";
import { assertCustodyContinuity } from "../src/custody.ts";
import { compileMoneyMovementRoute } from "../src/compiler.ts";
import { ONCHAIN_FINALITY_MODES } from "./walk-fixtures.ts";
import { NOW, route3Intent, CHAIN, CHAIN_B } from "./fixtures.ts";

/**
 * Route family 3 (PORT of the old route-3 suite): onchain -> onchain
 * (the same-chain direct transfer, the provider-native bridge baseline
 * and the mixed dex-bridge whose arrival amount stays honestly
 * UNKNOWN).
 */
describe("route 3: cross-chain DEX -> bridge", () => {
  it("compiles the mixed 2-hop plan and the provider-native bridge baseline", () => {
    const result = compileBase(route3Intent());
    const mixed = planOf(result, "mixed-dex-bridge");
    expect(mixed.legs.map((leg) => leg.legKind)).toEqual(["ONCHAIN_DEX_SWAP", "ONCHAIN_BRIDGE"]);
    expect(mixed.compositionClass).toBe("ONCHAIN_ONLY");
    expect(mixed.executionMode).toBe("OPTIMIZED_MULTI_PROVIDER");
    const baseline = planOf(result, "provider-native-bridge");
    expect(baseline.legs.map((leg) => leg.legKind)).toEqual(["ONCHAIN_BRIDGE"]);
    expect(baseline.executionMode).toBe("PASS_THROUGH_NATIVE");
    expect(baseline.isProviderNativeBaseline).toBe(true);
  });

  it("both chain environments are recorded (origin and destination)", () => {
    const result = compileBase(route3Intent());
    const mixed = planOf(result, "mixed-dex-bridge");
    expect(mixed.environmentClasses.length).toBe(2);
    expect(mixed.environmentClasses).toEqual([CHAIN, CHAIN_B]);
  });

  it("the bridge leg's arrival amount basis is UNKNOWN (observed at chain-B finality — never estimated)", () => {
    const mixed = planOf(compileBase(route3Intent()), "mixed-dex-bridge");
    const bridge = mixed.legs[1];
    if (bridge?.plannedAmount.basis !== "UNKNOWN") {
      throw new Error("the bridge arrival must be honestly unknown");
    }
    expect(bridge.plannedAmount.reason).toContain("chain-B finality");
    expect(bridge.plannedAmount.reason).toContain("never estimated without evidence");
    expect(mixed.legs[0]?.plannedAmount.basis).toBe("QUOTE_GROUNDED");
  });

  it("the mixed-dex-bridge stays COMPARABLE despite the honest UNKNOWN arrival (the bridge exemption)", () => {
    const mixed = planOf(compileBase(route3Intent()), "mixed-dex-bridge");
    expect(mixed.comparability.comparable).toBe(true);
    expect(mixed.candidateStatus).toBe("EXECUTABLE_CANDIDATE");
  });

  it("the custody chain: wallet(A) -> wallet(A) -> recipient(B) via the bridge protocol", () => {
    const result = compileBase(route3Intent());
    for (const plan of result.plans) {
      expect(() => assertCustodyContinuity(plan.legs.map((leg) => leg.custody))).not.toThrow();
    }
    const mixed = planOf(result, "mixed-dex-bridge");
    const [, bridge] = mixed.legs;
    expect(bridge?.custody.from.kind).toBe("ONCHAIN_WALLET");
    expect(bridge?.custody.to.kind).toBe("ONCHAIN_WALLET");
    expect(bridge?.custody.via?.kind).toBe("ONCHAIN_PROTOCOL");
    if (bridge?.custody.via?.kind === "ONCHAIN_PROTOCOL") {
      expect(bridge.custody.via.protocolKey).toBe("native-bridge");
      expect(bridge.custody.via.chainKey).toBe(CHAIN);
    }
  });

  it("the native baseline bridge moves the origin asset directly (INTENT_DECLARED)", () => {
    const baseline = planOf(compileBase(route3Intent()), "provider-native-bridge");
    const bridge = baseline.legs[0];
    if (bridge?.plannedAmount.basis !== "INTENT_DECLARED") {
      throw new Error("the native bridge moves the intent's declared amount");
    }
    expect(bridge.plannedAmount.amount.currency).toBe("ETH");
    expect(bridge.custody.assetRef).toContain("asset:ETH");
  });

  it("the happy walk: both legs observed, custody at the chain-B recipient", () => {
    const plan = planOf(compileBase(route3Intent()), "mixed-dex-bridge");
    const walk = walkRoutePlan({
      plan,
      at: NOW,
      observedAtIso: "2026-10-03T00:00:01Z",
      onchainFinalityModels: ONCHAIN_FINALITY_MODES,
    });
    expect(walk.status).toBe("ROUTE_COMPLETED_ALL_LEGS_OBSERVED");
    expect(walk.custodyAtStop?.party.kind).toBe("ONCHAIN_WALLET");
    expect(walk.legExecutions.every((execution) => execution.status === "OBSERVED_FINALITY_CANDIDATE")).toBe(true);
  });

  it("honest bridge exclusions without the deposit asset or protocol hints (never guessed)", () => {
    const input = baseCompilerInput(route3Intent());
    const { bridgeDepositAsset, ...hintsA } = input.routingHints ?? {};
    void bridgeDepositAsset;
    const withoutDeposit = compileMoneyMovementRoute({ ...input, routingHints: hintsA });
    expect(
      withoutDeposit.exclusions.some(
        (exclusion) => exclusion.shapeId === "mixed-dex-bridge" && exclusion.reasons.some((r) => r.includes("deposit asset")),
      ),
    ).toBe(true);
    const { bridgeProtocol, ...hintsB } = input.routingHints ?? {};
    void bridgeProtocol;
    const withoutProtocol = compileMoneyMovementRoute({ ...input, routingHints: hintsB });
    expect(
      withoutProtocol.exclusions.some(
        (exclusion) => exclusion.shapeId === "mixed-dex-bridge" && exclusion.reasons.some((r) => r.includes("bridge protocol")),
      ),
    ).toBe(true);
  });

  it("a same-chain intent compiles the onchain-direct-transfer shape only", () => {
    const intent = { ...route3Intent(), destination: { ...route3Intent().destination, currency: "ETH" } };
    const input = baseCompilerInput({
      ...intent,
      destination: {
        locationRef: "fundsloc:route-3-destination-wallet",
        currency: "ETH",
        observationRef: "obs:route-3-destination",
      },
      originAmount: { currency: "ETH", minorUnits: "10000000000000000" },
      arrivalCurrency: "ETH",
    });
    const observations = [
      {
        observationKind: "ONCHAIN_POSITION" as const,
        observationRef: "obs:route-3-origin",
        observationVersion: 1,
        locationRef: "fundsloc:route-3-origin-wallet",
        chainKey: CHAIN,
        accountRef: "0x1111111111111111111111111111111111111111",
        assetId: `${CHAIN}/asset:ETH`,
        symbol: "ETH",
        observedAmount: { currency: "ETH", minorUnits: "1" },
        freshness: { asOf: "2026-10-03T00:00:00Z", maxAgeSeconds: 3600 },
      },
      {
        observationKind: "ONCHAIN_POSITION" as const,
        observationRef: "obs:route-3-destination",
        observationVersion: 1,
        locationRef: "fundsloc:route-3-destination-wallet",
        chainKey: CHAIN,
        accountRef: "0x2222222222222222222222222222222222222222",
        assetId: `${CHAIN}/asset:ETH`,
        symbol: "ETH",
        observedAmount: { currency: "ETH", minorUnits: "0" },
        freshness: { asOf: "2026-10-03T00:00:00Z", maxAgeSeconds: 3600 },
      },
    ];
    const compiled = compileMoneyMovementRoute({
      ...input,
      locationObservations: observations,
      assetObservations: observations,
    });
    expect(compiled.plans.map((plan) => plan.shapeId)).toEqual(["onchain-direct-transfer"]);
    const direct = compiled.plans[0];
    expect(direct?.legs.map((leg) => leg.legKind)).toEqual(["ONCHAIN_TRANSFER"]);
    expect(direct?.candidateStatus).toBe("EXECUTABLE_CANDIDATE");
  });

  it("the bridge write is gate-evaluated and digest-bound (the write it executes is the gate's write)", () => {
    const mixed = planOf(compileBase(route3Intent()), "mixed-dex-bridge");
    const bridge = mixed.legs[1];
    expect(bridge?.authorizationLineage.legAuthorization.kind).toBe("ONCHAIN_GATE_DECISION");
    if (bridge?.authorizationLineage.legAuthorization.kind === "ONCHAIN_GATE_DECISION") {
      expect(bridge.authorizationLineage.legAuthorization.gateDecision.decision).toBe("ALLOW");
      expect(bridge.authorizationLineage.legAuthorization.writeDigest).toMatch(/^fnv1a64:/);
      expect(bridge.authorizationLineage.legAuthorization.routeRef).toBe(mixed.planId);
    }
  });
});
