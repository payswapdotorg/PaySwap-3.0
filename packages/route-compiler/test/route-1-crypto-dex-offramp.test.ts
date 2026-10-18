import { describe, expect, it } from "vitest";
import { compileBase, planOf, baseCompilerInput } from "./compiler-fixtures.ts";
import { walkRoutePlan } from "../src/route-walk.ts";
import { buildRouteJourneyEvidence, routeJourneyEvidenceDigest, buildRouteJourneyEvidenceFile } from "../src/evidence.ts";
import { buildRoutePlanLineageRecord } from "../src/evidence.ts";
import { assertCustodyContinuity } from "../src/custody.ts";
import { railCrossingCount } from "../src/rail-family.ts";
import { transferOutAuthorizationId } from "../src/identifiers.ts";
import { groundedPlannedAmount } from "./fixtures.ts";
import { NOW, route1Intent, MERCHANT_BANK_IBAN, PSP_PROVIDER } from "./fixtures.ts";

/**
 * Route family 1 (PORT of the old route-1 suite): onchain wallet ->
 * bank through the DEX + off-ramp + bank tail.
 */
describe("route 1: crypto -> DEX -> off-ramp -> bank", () => {
  it("compiles both shapes: the 4-hop mixed plan AND the provider-native baseline (never ranked away)", () => {
    const result = compileBase(route1Intent());
    const mixed = planOf(result, "mixed-dex-offramp");
    expect(mixed.legs.map((leg) => leg.legKind)).toEqual([
      "ONCHAIN_DEX_SWAP",
      "ONCHAIN_TRANSFER",
      "OFF_RAMP_PAYOUT",
      "BANK_SETTLEMENT",
    ]);
    expect(mixed.compositionClass).toBe("MIXED");
    expect(mixed.executionMode).toBe("OPTIMIZED_MULTI_PROVIDER");
    expect(mixed.isProviderNativeBaseline).toBe(false);
    const baseline = planOf(result, "provider-native-offramp");
    expect(baseline.legs.map((leg) => leg.legKind)).toEqual(["ONCHAIN_TRANSFER", "OFF_RAMP_PAYOUT", "BANK_SETTLEMENT"]);
    expect(baseline.executionMode).toBe("PASS_THROUGH_NATIVE");
    expect(baseline.isProviderNativeBaseline).toBe(true);
    expect(baseline.candidateStatus).toBe("PROVIDER_NATIVE_BASELINE");
    expect(result.plans.map((plan) => plan.planId).indexOf(mixed.planId)).toBeLessThan(
      result.plans.map((plan) => plan.planId).indexOf(baseline.planId),
    );
  });

  it("the authorization lineage per leg: gate ALLOW, transfer-out grant, intent-only", () => {
    const mixed = planOf(compileBase(route1Intent()), "mixed-dex-offramp");
    const [swap, deposit, payout, bank] = mixed.legs as unknown as [
      { authorizationLineage: { legAuthorization: { kind: string; gateDecision: { decision: string } } } },
      { authorizationLineage: { legAuthorization: { kind: string; gateDecision: { decision: string } } } },
      { authorizationLineage: { legAuthorization: { kind: string; transferOutAuthorizationId: string; gate: { allowed: boolean } } } },
      { authorizationLineage: { legAuthorization: { kind: string; reason: string } } },
    ];
    expect(swap.authorizationLineage.legAuthorization.kind).toBe("ONCHAIN_GATE_DECISION");
    expect(swap.authorizationLineage.legAuthorization.gateDecision.decision).toBe("ALLOW");
    expect(deposit.authorizationLineage.legAuthorization.gateDecision.decision).toBe("ALLOW");
    expect(payout.authorizationLineage.legAuthorization.kind).toBe("PAYOUT_TRANSFER_OUT_GRANT");
    expect(payout.authorizationLineage.legAuthorization.transferOutAuthorizationId).toBe(
      transferOutAuthorizationId(route1Intent().intentId),
    );
    expect(payout.authorizationLineage.legAuthorization.gate.allowed).toBe(true);
    expect(bank.authorizationLineage.legAuthorization.kind).toBe("INTENT_AUTHORIZATION_ONLY");
  });

  it("fresh grounding everywhere with the exact observation versions (the preservation law)", () => {
    const mixed = planOf(compileBase(route1Intent()), "mixed-dex-offramp");
    for (const leg of mixed.legs) {
      expect(leg.stateGrounding.groundingFailures).toEqual([]);
      expect(leg.stateGrounding.observations.length).toBeGreaterThan(0);
      for (const observation of leg.stateGrounding.observations) {
        expect(observation.fresh).toBe(true);
        expect(observation.observationVersion).toBeGreaterThanOrEqual(1);
        expect(observation.freshnessRule).toMatch(/inclusive|corridor/);
      }
    }
    const result = compileBase(route1Intent());
    expect(result.observationVersionPins.length).toBeGreaterThan(0);
    expect(result.observationVersionPins.every((pin) => pin.observationVersion >= 1)).toBe(true);
  });

  it("finality is candidate-only everywhere (INV-F06): PROBABILISTIC for the swap, PROVIDER_OWNED for the tail", () => {
    const mixed = planOf(compileBase(route1Intent()), "mixed-dex-offramp");
    for (const leg of mixed.legs) {
      expect(leg.finality.finalityNeverAssumed).toBe(true);
      for (const candidate of leg.finality.candidates) {
        expect(candidate.candidateOnly).toBe(true);
      }
    }
    expect(mixed.legs[0]?.finality.candidates[0]?.model).toBe("PROBABILISTIC");
    expect(mixed.legs[2]?.finality.candidates[0]?.model).toBe("PROVIDER_OWNED");
    expect(mixed.legs[3]?.finality.candidates[0]?.model).toBe("PROVIDER_OWNED");
  });

  it("the custody chain: wallet -> wallet -> provider -> provider -> bank, all evidenced (INV-C09/E02)", () => {
    const result = compileBase(route1Intent());
    for (const plan of result.plans) {
      expect(() => assertCustodyContinuity(plan.legs.map((leg) => leg.custody))).not.toThrow();
      for (const leg of plan.legs) {
        expect(leg.custody.evidenceRefs.length).toBeGreaterThan(0);
        expect(leg.evidenceRefs.length).toBeGreaterThan(0);
      }
    }
    const mixed = planOf(result, "mixed-dex-offramp");
    const [swap, deposit, payout, bank] = mixed.legs;
    expect(swap?.custody.from.kind).toBe("ONCHAIN_WALLET");
    expect(swap?.custody.to.kind).toBe("ONCHAIN_WALLET");
    expect(swap?.custody.via?.kind).toBe("ONCHAIN_PROTOCOL");
    expect(deposit?.custody.to.kind).toBe("EXTERNAL_PROVIDER");
    expect(payout?.custody.via?.kind).toBe("EXTERNAL_PROVIDER");
    expect(bank?.custody.to.kind).toBe("EXTERNAL_BANK_INSTRUMENT");
    if (bank?.custody.to.kind === "EXTERNAL_BANK_INSTRUMENT") {
      expect(bank.custody.to.externalRef).toBe(MERCHANT_BANK_IBAN);
    }
  });

  it("planned amounts: QUOTE_GROUNDED swap + deposit, CONVERSION_GROUNDED payout + bank", () => {
    const mixed = planOf(compileBase(route1Intent()), "mixed-dex-offramp");
    expect(mixed.legs[0]?.plannedAmount.basis).toBe("QUOTE_GROUNDED");
    expect(mixed.legs[1]?.plannedAmount.basis).toBe("QUOTE_GROUNDED");
    expect(mixed.legs[2]?.plannedAmount.basis).toBe("CONVERSION_GROUNDED");
    expect(mixed.legs[3]?.plannedAmount.basis).toBe("CONVERSION_GROUNDED");
    const payoutPlanned = mixed.legs[2]?.plannedAmount;
    if (payoutPlanned?.basis !== "CONVERSION_GROUNDED") {
      throw new Error("the payout leg must be conversion-grounded");
    }
    expect(payoutPlanned.amount.currency).toBe("EUR");
    expect(payoutPlanned.amount.minorUnits).toBe("294");
    void groundedPlannedAmount;
  });

  it("the mixed plan is COMPARABLE and EXECUTABLE (the five requirements satisfied)", () => {
    const result = compileBase(route1Intent());
    const mixed = planOf(result, "mixed-dex-offramp");
    expect(mixed.comparability.comparable).toBe(true);
    expect(mixed.candidateStatus).toBe("EXECUTABLE_CANDIDATE");
    expect(mixed.score?.netNumeraireMinorUnits).toBe("2299880");
  });

  it("the discovery tier never authorizes execution (the literal on the result)", () => {
    const result = compileBase(route1Intent());
    expect(result.discoveryPermitsExecution).toBe(false);
    expect(result.status).toBe("ROUTES_COMPILED");
    expect(result.intentRef).toBe(route1Intent().intentId);
  });

  it("the rail-crossing count: deposit (ONCHAIN->PROVIDER) and bank (PROVIDER->BANK) cross WITHIN legs (F-2)", () => {
    const mixed = planOf(compileBase(route1Intent()), "mixed-dex-offramp");
    expect(railCrossingCount(mixed.legs.map((leg) => leg.custody))).toBe(2);
  });

  it("the happy walk: ROUTE_COMPLETED_ALL_LEGS_OBSERVED, custody at the bank", () => {
    const plan = planOf(compileBase(route1Intent()), "mixed-dex-offramp");
    const walk = walkRoutePlan({ plan, at: NOW, observedAtIso: "2026-10-03T00:00:01Z" });
    expect(walk.status).toBe("ROUTE_COMPLETED_ALL_LEGS_OBSERVED");
    expect(walk.executionTier).toBe("LAB_SIMULATION_NON_PRODUCTION");
    expect(walk.custodyAtStop?.party.kind).toBe("EXTERNAL_BANK_INSTRUMENT");
    expect(walk.legExecutions.every((execution) => execution.status === "OBSERVED_FINALITY_CANDIDATE")).toBe(true);
  });

  it("an OUTCOME_UNKNOWN mid-route walk requires reconciliation (INV-X01/X02/X03)", () => {
    const plan = planOf(compileBase(route1Intent()), "mixed-dex-offramp");
    const payoutLeg = plan.legs[2];
    const walk = walkRoutePlan({
      plan,
      at: NOW,
      observedAtIso: "2026-10-03T00:00:01Z",
      faults: { [payoutLeg?.legId ?? ""]: { kind: "FIAT_OUTCOME_UNKNOWN", reason: "the fixture provider could not observe the payout" } },
    });
    expect(walk.status).toBe("ROUTE_REQUIRES_RECONCILIATION");
    expect(walk.reconciliation?.blindRetryForbidden).toBe(true);
    expect(walk.reconciliation?.resolver).toBe("SETTLEMENT_RECONCILIATION_AUTHORITY");
    expect(walk.reconciliation?.externalChecks.length).toBeGreaterThan(0);
    expect(walk.legExecutions[3]?.status).toBe("NOT_EXECUTED");
  });

  it("honest exclusion when the conversion rules lack the payout pair (FX is never invented)", async () => {
    const result = baseCompilerInput(route1Intent(), {
      conversionRules: [
        {
          ruleId: "rule:eth-eur-only",
          fromCurrency: "ETH",
          toCurrency: "EUR",
          rate: { numerator: "276", denominator: "1000000000000000000" },
          declaredBy: "fixture:peg-declaration",
        },
      ],
    });
    const { compileMoneyMovementRoute } = await import("../src/compiler.ts");
    const compiled = compileMoneyMovementRoute(result);
    expect(compiled.plans.map((plan) => plan.shapeId)).not.toContain("mixed-dex-offramp");
    expect(compiled.exclusions.some((exclusion) => exclusion.shapeId === "mixed-dex-offramp" && exclusion.reasons.some((reason) => reason.includes("never guessed")))).toBe(true);
    expect(compiled.status).toBe("ROUTES_COMPILED");
    expect(PSP_PROVIDER).toBe("psp-fixture");
  });

  it("the journey evidence pairs the plan with its own walk and digests it", () => {
    const result = compileBase(route1Intent());
    const plan = planOf(result, "mixed-dex-offramp");
    const walk = walkRoutePlan({ plan, at: NOW, observedAtIso: "2026-10-03T00:00:01Z" });
    const record = buildRouteJourneyEvidence(plan, walk, result.observationVersionPins);
    expect(record.journeyId).toBe(`journey:${route1Intent().intentId}:mixed-dex-offramp`);
    expect(routeJourneyEvidenceDigest(record)).toMatch(/^fnv1a64:/);
    const file = buildRouteJourneyEvidenceFile([record]);
    expect(file.law).toBe("FIXTURE_PROVEN_LIVE_BROADCAST_IMPOSSIBLE_BY_LAW");
    expect(file.digests[0]?.journeyId).toBe(record.journeyId);
    const lineage = buildRoutePlanLineageRecord(plan, route1Intent().intentAuthorizationRef, result.observationVersionPins);
    expect(lineage.authorityKinds).toEqual([
      "ONCHAIN_GATE_DECISION",
      "ONCHAIN_GATE_DECISION",
      "PAYOUT_TRANSFER_OUT_GRANT",
      "INTENT_AUTHORIZATION_ONLY",
    ]);
    expect(lineage.quoteIds).toEqual(["quote:fixture-dex:001"]);
  });
});
