import { describe, expect, it } from "vitest";
import { compileMoneyMovementRoute } from "../src/compiler.ts";
import { walkRoutePlan } from "../src/route-walk.ts";
import { assertCustodyContinuity } from "../src/custody.ts";
import { validateFundsLocationObservation } from "../src/grounding.ts";
import { ROUTE_SHAPE_IDS, shapeLegSequence, shapeCompositionClass, shapeExecutionMode } from "../src/shapes.ts";
import { transferOutAuthorizationId } from "../src/identifiers.ts";
import { contentDigest, canonicalJsonStringify } from "../src/canonical.ts";
import { NOW } from "./fixtures.ts";
import {
  CORRIDOR_KES_BANK_EXTERNAL_REF,
  CORRIDOR_OFFRAMP_PROVIDER,
  CORRIDOR_ONRAMP_PROVIDER,
  CORRIDOR_PAYSTACK_RECEIVING_G,
  CORRIDOR_RELAY_ACCOUNT_G,
  CORRIDOR_USDC_ASSET_ID,
  CORRIDOR_USDC_ISSUER_G,
  STELLAR_CHAIN_KEY,
  STRKEY_ACCOUNT_PATTERN,
  corridorCompilerInput,
  corridorConversionRules,
  corridorLocationObservations,
  corridorRelayObservation,
  corridorRoutingHints,
  route5Intent,
} from "./corridor-fixtures.ts";

/**
 * Route family 5 (P22-C, ADR-0016 D5): the CROSS-PROVIDER CORRIDOR —
 * GHS (a Flutterwave provider account) -> USDC(Stellar) -> KES (a Kenyan
 * bank instrument) through the `cross-provider-corridor` shape, admitted
 * ONLY on the OBSERVED onchain middle (the relay account's issuer-scoped
 * USDC position on `stellar:testnet`). This battery pins:
 * - the exact skeleton law (the four-leg sequence, byte-exact);
 * - the observed-middle location-pair law (PROVIDER_ACCOUNT ->
 *   BANK_INSTRUMENT, this shape only, observed middle only);
 * - the P21 honest no-route law RE-PINNED on the unobserved middle;
 * - the custody chain, the authorizations, the exact conversions;
 * - the deterministic replay (byte-identical digests).
 */
describe("route 5: the cross-provider corridor (GHS -> USDC(Stellar) -> KES)", () => {
  it("the exact skeleton law: the shape is a member of the closed vocabulary with the pinned four-leg sequence", () => {
    expect(ROUTE_SHAPE_IDS).toContain("cross-provider-corridor");
    expect(shapeLegSequence("cross-provider-corridor")).toEqual([
      "FIAT_PSP_COLLECT",
      "PSP_STABLECOIN_ISSUANCE",
      "ONCHAIN_TRANSFER",
      "OFF_RAMP_PAYOUT",
    ]);
    expect(shapeCompositionClass("cross-provider-corridor")).toBe("MIXED");
    expect(shapeExecutionMode("cross-provider-corridor")).toBe("OPTIMIZED_MULTI_PROVIDER");
  });

  it("the ADR-0016 appendix literals are byte-identical in the fixture world (the pin contract)", () => {
    expect(STELLAR_CHAIN_KEY).toBe("stellar:testnet");
    expect(CORRIDOR_USDC_ASSET_ID).toBe(`stellar:testnet/asset:USDC:${CORRIDOR_USDC_ISSUER_G}`);
    expect(CORRIDOR_USDC_ASSET_ID).toBe("stellar:testnet/asset:USDC:GDSTRKEYISSUERFIXTUREUSDCSTELLARTESTNETP22LANEPINAAAAAAA");
    // The StrKey account shape law (D9): every corridor account is G-shaped.
    expect(STRKEY_ACCOUNT_PATTERN.test(CORRIDOR_USDC_ISSUER_G)).toBe(true);
    expect(STRKEY_ACCOUNT_PATTERN.test(CORRIDOR_RELAY_ACCOUNT_G)).toBe(true);
    expect(STRKEY_ACCOUNT_PATTERN.test(CORRIDOR_PAYSTACK_RECEIVING_G)).toBe(true);
    // Two issuers of the same code are two assets (D3).
    expect(CORRIDOR_USDC_ASSET_ID).not.toBe(`stellar:testnet/asset:USDC:GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`);
  });

  it("the observed middle is a REAL wire-validatable onchain position (the issuer-scoped USDC on stellar:testnet)", () => {
    const middle = validateFundsLocationObservation(corridorRelayObservation());
    if (middle.observationKind !== "ONCHAIN_POSITION") {
      throw new Error("the observed middle must be an onchain position");
    }
    expect(middle.chainKey).toBe(STELLAR_CHAIN_KEY);
    expect(middle.assetId).toBe(CORRIDOR_USDC_ASSET_ID);
  });

  it("compiles the four-leg corridor plan on the observed middle (the ONLY plan over this location pair)", () => {
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
    expect(result.status).toBe("ROUTES_COMPILED");
    expect(result.plans.map((plan) => plan.shapeId)).toEqual(["cross-provider-corridor"]);
    const plan = result.plans[0]!;
    expect(plan.planId).toBe(`route-plan:${route5Intent().intentId}:cross-provider-corridor`);
    expect(plan.legs.map((leg) => leg.legKind)).toEqual([
      "FIAT_PSP_COLLECT",
      "PSP_STABLECOIN_ISSUANCE",
      "ONCHAIN_TRANSFER",
      "OFF_RAMP_PAYOUT",
    ]);
    expect(plan.legs.map((leg) => leg.hopIndex)).toEqual([0, 1, 2, 3]);
    expect(plan.isProviderNativeBaseline).toBe(false);
    expect(plan.compositionClass).toBe("MIXED");
    expect(plan.environmentClasses).toEqual([STELLAR_CHAIN_KEY]);
    expect(result.discoveryPermitsExecution).toBe(false);
  });

  it("the custody chain: FLW payer -> FLW pool -> stellar relay wallet -> Paystack -> the KES bank (INV-C09/E02)", () => {
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
    const plan = result.plans[0]!;
    expect(() => assertCustodyContinuity(plan.legs.map((leg) => leg.custody))).not.toThrow();
    const [collect, issuance, relay, payout] = plan.legs;
    expect(collect?.custody.from.kind).toBe("EXTERNAL_PROVIDER");
    if (collect?.custody.from.kind === "EXTERNAL_PROVIDER") {
      expect(collect.custody.from.providerName).toBe(CORRIDOR_ONRAMP_PROVIDER);
      expect(collect.custody.from.accountRef).toBe("acct-flw-ghs-001");
    }
    expect(collect?.custody.to.kind).toBe("EXTERNAL_PROVIDER");
    expect(issuance?.custody.via?.kind).toBe("ONCHAIN_PROTOCOL");
    if (issuance?.custody.via?.kind === "ONCHAIN_PROTOCOL") {
      expect(issuance.custody.via.protocolKey).toBe("stablecoin-issuer:usdc");
      expect(issuance.custody.via.chainKey).toBe(STELLAR_CHAIN_KEY);
    }
    if (issuance?.custody.to.kind === "ONCHAIN_WALLET") {
      expect(issuance.custody.to.accountRef).toBe(CORRIDOR_RELAY_ACCOUNT_G);
      expect(issuance.custody.to.chainKey).toBe(STELLAR_CHAIN_KEY);
    }
    expect(issuance?.custody.assetRef).toBe(CORRIDOR_USDC_ASSET_ID);
    if (relay?.custody.from.kind === "ONCHAIN_WALLET") {
      expect(relay.custody.from.accountRef).toBe(CORRIDOR_RELAY_ACCOUNT_G);
    }
    if (relay?.custody.to.kind === "EXTERNAL_PROVIDER") {
      expect(relay.custody.to.providerName).toBe(CORRIDOR_OFFRAMP_PROVIDER);
      expect(relay.custody.to.accountRef).toBe(CORRIDOR_PAYSTACK_RECEIVING_G);
    }
    expect(relay?.custody.assetRef).toBe(CORRIDOR_USDC_ASSET_ID);
    if (payout?.custody.from.kind === "EXTERNAL_PROVIDER") {
      expect(payout.custody.from.providerName).toBe(CORRIDOR_OFFRAMP_PROVIDER);
    }
    if (payout?.custody.to.kind === "EXTERNAL_BANK_INSTRUMENT") {
      expect(payout.custody.to.externalRef).toBe(CORRIDOR_KES_BANK_EXTERNAL_REF);
    }
    for (const leg of plan.legs) {
      expect(leg.custody.evidenceRefs.length).toBeGreaterThan(0);
      expect(leg.evidenceRefs.length).toBeGreaterThan(0);
    }
  });

  it("the authorization lineage per leg: intent-only collect/issuance, the gate-ALLOWed write, the payout transfer-out grant", () => {
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
    const plan = result.plans[0]!;
    const [collect, issuance, relay, payout] = plan.legs as unknown as [
      { authorizationLineage: { legAuthorization: { kind: string; reason: string } } },
      { authorizationLineage: { legAuthorization: { kind: string; reason: string } } },
      { authorizationLineage: { legAuthorization: { kind: string; gateDecision: { decision: string }; writeDigest: string } } },
      { authorizationLineage: { legAuthorization: { kind: string; transferOutAuthorizationId: string; gate: { allowed: boolean } } } },
    ];
    expect(collect.authorizationLineage.legAuthorization.kind).toBe("INTENT_AUTHORIZATION_ONLY");
    expect(issuance.authorizationLineage.legAuthorization.kind).toBe("INTENT_AUTHORIZATION_ONLY");
    expect(relay.authorizationLineage.legAuthorization.kind).toBe("ONCHAIN_GATE_DECISION");
    expect(relay.authorizationLineage.legAuthorization.gateDecision.decision).toBe("ALLOW");
    expect(relay.authorizationLineage.legAuthorization.writeDigest).toMatch(/^fnv1a64:/);
    expect(payout.authorizationLineage.legAuthorization.kind).toBe("PAYOUT_TRANSFER_OUT_GRANT");
    expect(payout.authorizationLineage.legAuthorization.transferOutAuthorizationId).toBe(
      transferOutAuthorizationId(route5Intent().intentId),
    );
    expect(payout.authorizationLineage.legAuthorization.gate.allowed).toBe(true);
  });

  it("the exact conversions: 1,000.00 GHS -> 125 USDC -> 16,125.00 KES (no rounding drift, FX never invented)", () => {
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
    const plan = result.plans[0]!;
    const [collect, issuance, relay, payout] = plan.legs;
    if (collect?.plannedAmount.basis !== "INTENT_DECLARED") {
      throw new Error("the collect leg must carry the intent's declared GHS amount");
    }
    expect(collect.plannedAmount.amount).toEqual({ currency: "GHS", minorUnits: "100000" });
    if (issuance?.plannedAmount.basis !== "CONVERSION_GROUNDED") {
      throw new Error("the issuance leg must be conversion-grounded");
    }
    expect(issuance.plannedAmount.amount).toEqual({ currency: "USDC", minorUnits: "125000000" });
    expect(issuance.plannedAmount.ruleId).toBe("rule:ghs-usdc");
    if (relay?.plannedAmount.basis !== "CONVERSION_GROUNDED") {
      throw new Error("the relay transfer leg must be conversion-grounded");
    }
    expect(relay.plannedAmount.amount).toEqual({ currency: "USDC", minorUnits: "125000000" });
    if (payout?.plannedAmount.basis !== "CONVERSION_GROUNDED") {
      throw new Error("the payout leg must be conversion-grounded");
    }
    expect(payout.plannedAmount.amount).toEqual({ currency: "KES", minorUnits: "1612500" });
    expect(payout.plannedAmount.ruleId).toBe("rule:usdc-kes");
  });

  it("fresh grounding everywhere with the exact observation versions (the preservation law)", () => {
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
    const plan = result.plans[0]!;
    for (const leg of plan.legs) {
      expect(leg.stateGrounding.groundingFailures).toEqual([]);
      expect(leg.stateGrounding.observations.length).toBeGreaterThan(0);
      for (const observation of leg.stateGrounding.observations) {
        expect(observation.fresh).toBe(true);
        expect(observation.observationVersion).toBeGreaterThanOrEqual(1);
      }
    }
    // The observed middle's exact version is pinned (never "latest").
    expect(
      result.observationVersionPins.some(
        (pin) => pin.instanceId === "fundsloc:route-5-relay-wallet" && pin.observationVersion === 3,
      ),
    ).toBe(true);
  });

  it("finality is candidate-only everywhere (INV-F06): provider-owned fiat legs, probabilistic stellar leg", () => {
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
    const plan = result.plans[0]!;
    for (const leg of plan.legs) {
      expect(leg.finality.finalityNeverAssumed).toBe(true);
      for (const candidate of leg.finality.candidates) {
        expect(candidate.candidateOnly).toBe(true);
      }
    }
    expect(plan.legs[0]?.finality.candidates[0]?.model).toBe("PROVIDER_OWNED");
    expect(plan.legs[1]?.finality.candidates[0]?.model).toBe("PROVIDER_OWNED");
    expect(plan.legs[2]?.finality.candidates[0]?.model).toBe("PROBABILISTIC");
    expect(plan.legs[3]?.finality.candidates[0]?.model).toBe("PROVIDER_OWNED");
  });

  it("the happy walk: ROUTE_COMPLETED_ALL_LEGS_OBSERVED, custody at the KES bank", () => {
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
    const plan = result.plans[0]!;
    const walk = walkRoutePlan({ plan, at: NOW, observedAtIso: "2026-10-03T00:00:01Z" });
    expect(walk.status).toBe("ROUTE_COMPLETED_ALL_LEGS_OBSERVED");
    expect(walk.custodyAtStop?.party.kind).toBe("EXTERNAL_BANK_INSTRUMENT");
  });

  it("THE P21 NO-ROUTE LAW RE-PINNED: without the observed middle the fiat pair compiles NOTHING (ADR-0014 D7 preserved)", () => {
    const input = corridorCompilerInput(route5Intent(), {
      locationObservations: corridorLocationObservations({ withoutMiddle: true }),
    });
    const result = compileMoneyMovementRoute(input);
    expect(result.status).toBe("NO_COMPILABLE_ROUTE");
    expect(result.plans).toEqual([]);
    // The honest exclusions: the corridor shape names the unobserved middle;
    // the location pair itself stays unsupported without it.
    const corridorExclusion = result.exclusions.find((exclusion) => exclusion.shapeId === "cross-provider-corridor");
    expect(corridorExclusion).toBeDefined();
    expect(corridorExclusion?.reasons.join(" ")).toContain("OBSERVED onchain middle");
    expect(corridorExclusion?.reasons.join(" ")).toContain("never a fabricated middle");
    const pairExclusion = result.exclusions.find(
      (exclusion) => exclusion.shapeId === "unsupported-origin-destination-pair",
    );
    expect(pairExclusion).toBeDefined();
    expect(pairExclusion?.reasons[0]).toContain("'PROVIDER_ACCOUNT' -> 'BANK_INSTRUMENT'");
  });

  it("an UNOBSERVED relay (hint present, no matching onchain position) compiles nothing — the hint alone never grounds the middle", () => {
    const mismatchedMiddle = corridorRelayObservation();
    const observed = corridorLocationObservations().map((observation) =>
      observation.observationRef === mismatchedMiddle.observationRef
        ? { ...observation, accountRef: "GDIFFERENTACCOUNTFIXTURESTELLARTESTNETP22CORRIDORPINCCCC" }
        : observation,
    );
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent(), { locationObservations: observed }));
    expect(result.status).toBe("NO_COMPILABLE_ROUTE");
    expect(result.plans).toEqual([]);
    expect(
      result.exclusions.some(
        (exclusion) => exclusion.shapeId === "cross-provider-corridor" && exclusion.reasons.join(" ").includes("OBSERVED onchain middle"),
      ),
    ).toBe(true);
  });

  it("honest exclusion when the relay hint is absent (the compiler never guesses a relay)", () => {
    const { onrampDeliveryAccount, ...hints } = corridorRoutingHints();
    void onrampDeliveryAccount;
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent(), { routingHints: hints }));
    expect(result.plans.map((plan) => plan.shapeId)).not.toContain("cross-provider-corridor");
    expect(
      result.exclusions.some(
        (exclusion) => exclusion.shapeId === "cross-provider-corridor" && exclusion.reasons.join(" ").includes("never guesses a relay"),
      ),
    ).toBe(true);
  });

  it("honest exclusion when the off-ramp deposit hint is absent (custody destinations are never guessed)", () => {
    const { offRampDeposit, ...hints } = corridorRoutingHints();
    void offRampDeposit;
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent(), { routingHints: hints }));
    expect(result.plans.map((plan) => plan.shapeId)).not.toContain("cross-provider-corridor");
    expect(
      result.exclusions.some(
        (exclusion) => exclusion.shapeId === "cross-provider-corridor" && exclusion.reasons.join(" ").includes("never guessed"),
      ),
    ).toBe(true);
  });

  it("honest exclusion when the payout corridor route is not offered (the payout leg is never inferred)", () => {
    const { offRampPayoutRouteId, ...hints } = corridorRoutingHints();
    void offRampPayoutRouteId;
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent(), { routingHints: hints }));
    expect(result.plans.map((plan) => plan.shapeId)).not.toContain("cross-provider-corridor");
    expect(
      result.exclusions.some(
        (exclusion) => exclusion.shapeId === "cross-provider-corridor" && exclusion.reasons.join(" ").includes("explicit routing hint"),
      ),
    ).toBe(true);
  });

  it("honest exclusion when the GHS->USDC or USDC->KES conversion rules are absent (FX is never invented)", () => {
    const withoutIssuanceRule = corridorConversionRules().filter((rule) => rule.ruleId !== "rule:ghs-usdc");
    const first = compileMoneyMovementRoute(corridorCompilerInput(route5Intent(), { conversionRules: withoutIssuanceRule }));
    expect(first.plans.map((plan) => plan.shapeId)).not.toContain("cross-provider-corridor");
    expect(
      first.exclusions.some(
        (exclusion) => exclusion.shapeId === "cross-provider-corridor" && exclusion.reasons.join(" ").includes("never guessed"),
      ),
    ).toBe(true);
    const withoutPayoutRule = corridorConversionRules().filter((rule) => rule.ruleId !== "rule:usdc-kes");
    const second = compileMoneyMovementRoute(corridorCompilerInput(route5Intent(), { conversionRules: withoutPayoutRule }));
    expect(second.plans.map((plan) => plan.shapeId)).not.toContain("cross-provider-corridor");
    expect(
      second.exclusions.some(
        (exclusion) => exclusion.shapeId === "cross-provider-corridor" && exclusion.reasons.join(" ").includes("never guessed"),
      ),
    ).toBe(true);
  });

  it("honest exclusion when the off-ramp custody is split across providers (ONE provider's custody, never spliced)", () => {
    const splitHints = {
      ...corridorRoutingHints(),
      offRampDeposit: {
        providerName: "flutterwave" as const,
        chainKey: STELLAR_CHAIN_KEY,
        accountRef: CORRIDOR_PAYSTACK_RECEIVING_G,
      },
    };
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent(), { routingHints: splitHints }));
    expect(result.plans.map((plan) => plan.shapeId)).not.toContain("cross-provider-corridor");
    expect(
      result.exclusions.some(
        (exclusion) =>
          exclusion.shapeId === "cross-provider-corridor" && exclusion.reasons.join(" ").includes("ONE provider's custody"),
      ),
    ).toBe(true);
  });

  it("a stale origin observation yields an INELIGIBLE_CANDIDATE with the honest grounding failure (the staleness law)", () => {
    const staled = corridorLocationObservations().map((observation) =>
      observation.observationKind === "PROVIDER_ACCOUNT"
        ? { ...observation, freshness: { asOf: "2026-10-02T00:00:00Z", maxAgeSeconds: 60 } }
        : observation,
    );
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent(), { locationObservations: staled }));
    const plan = result.plans.find((candidate) => candidate.shapeId === "cross-provider-corridor");
    expect(plan?.candidateStatus).toBe("INELIGIBLE_CANDIDATE");
    expect(plan?.ineligibilityReasons.some((reason) => reason.code === "LEG_GROUNDING_FAILURE")).toBe(true);
    expect(result.status).toBe("ROUTES_COMPILED");
  });

  it("the determinism law: identical inputs produce byte-identical compilations (the digest proof)", () => {
    const first = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
    const second = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
    expect(second.compilationDigest).toBe(first.compilationDigest);
    expect(canonicalJsonStringify(second)).toBe(canonicalJsonStringify(first));
    expect(contentDigest(second)).toBe(contentDigest(first));
  });

  it("the location pair is admitted ONLY through this shape: no other family compiles over the corridor pair", () => {
    const result = compileMoneyMovementRoute(corridorCompilerInput(route5Intent()));
    // The corridor pair (PROVIDER_ACCOUNT -> BANK_INSTRUMENT) is served by
    // the cross-provider-corridor shape ONLY — every other family's guard
    // refuses the pair (the on-ramp family needs an ONCHAIN destination,
    // the off-ramp/merchant families need an ONCHAIN origin).
    expect(result.plans.every((plan) => plan.shapeId === "cross-provider-corridor")).toBe(true);
    for (const shapeId of ROUTE_SHAPE_IDS) {
      if (shapeId === "cross-provider-corridor") {
        continue;
      }
      expect(result.plans.map((plan) => plan.shapeId)).not.toContain(shapeId);
    }
  });
});
