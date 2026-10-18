import { describe, expect, it } from "vitest";
import { compileMoneyMovementRoute } from "../src/compiler.ts";
import { walkRoutePlan } from "../src/route-walk.ts";
import { observationVersionFingerprint } from "../src/pins/execution-graph.ts";
import { baseCompilerInput, compileBase } from "./compiler-fixtures.ts";
import { route1Intent, route2Intent, route3Intent, route4Intent, NOW } from "./fixtures.ts";
import { RouteCompilerInputError } from "../src/errors.ts";

/**
 * Determinism (PORT of the old determinism suite + the NET-NEW
 * observation-VERSION fingerprint grounding laws): byte-identical
 * replays, permutation invariance, pure-function identities, the
 * canonical emission order and the digest discipline.
 */
describe("determinism (same inputs -> same routes, byte-identical)", () => {
  it("the same intent and observations deep-equal with the same compilationDigest (all four routes)", () => {
    for (const intent of [route1Intent(), route2Intent(), route3Intent(), route4Intent()]) {
      const first = compileMoneyMovementRoute(baseCompilerInput(intent));
      const second = compileMoneyMovementRoute(baseCompilerInput(intent));
      expect(first).toEqual(second);
      expect(first.compilationDigest).toBe(second.compilationDigest);
      for (let index = 0; index < first.plans.length; index += 1) {
        expect(first.plans[index]?.planDigest).toBe(second.plans[index]?.planDigest);
      }
    }
  });

  it("PERMUTATION INVARIANCE: reversing every array input yields the identical digest (the input order law)", () => {
    const base = baseCompilerInput(route1Intent());
    const permuted: typeof base = {
      ...base,
      venues: [...base.venues].reverse(),
      onchain: { ...base.onchain, instances: [...base.onchain.instances].reverse() },
      locationObservations: [...base.locationObservations].reverse(),
      assetObservations: [...base.assetObservations].reverse(),
      conversionRules: [...base.conversionRules].reverse(),
      payoutConstraints: [...base.payoutConstraints].reverse(),
      settlementDestinations: [...base.settlementDestinations].reverse(),
      merchantEligibility: [...base.merchantEligibility].reverse(),
      liquidityEstimates: [...base.liquidityEstimates].reverse(),
    };
    const first = compileMoneyMovementRoute(base);
    const second = compileMoneyMovementRoute(permuted);
    expect(first.compilationDigest).toBe(second.compilationDigest);
    expect(first.plans.map((plan) => plan.planId)).toEqual(second.plans.map((plan) => plan.planId));
  });

  it("planId/legId are pure functions of the canonical projection; plans are emitted in canonical planId order (the compiler does no ranking)", () => {
    const planResult = compileBase(route1Intent());
    const plan = planResult.plans.find((candidate) => candidate.shapeId === "mixed-dex-offramp");
    if (plan === undefined) {
      throw new Error("the mixed plan must compile");
    }
    expect(plan.planId).toBe(`route-plan:${route1Intent().intentId}:mixed-dex-offramp`);
    expect(plan.legs[0]?.legId).toBe(`${plan.planId}:leg:0:ONCHAIN_DEX_SWAP`);
    expect(plan.legs[2]?.legId).toBe(`${plan.planId}:leg:2:OFF_RAMP_PAYOUT`);
    for (const intent of [route1Intent(), route2Intent(), route3Intent(), route4Intent()]) {
      const result = compileBase(intent);
      const planIds = result.plans.map((plan) => plan.planId);
      expect([...planIds].sort()).toEqual(planIds);
    }
  });

  it("walks deep-equal on the same inputs (deterministic fault injection)", () => {
    const plan = compileBase(route1Intent()).plans.find((candidate) => candidate.shapeId === "mixed-dex-offramp");
    if (plan === undefined) {
      throw new Error("the mixed plan must compile");
    }
    const walkA = walkRoutePlan({ plan, at: NOW, observedAtIso: "2026-10-03T00:00:01Z" });
    const walkB = walkRoutePlan({ plan, at: NOW, observedAtIso: "2026-10-03T00:00:01Z" });
    expect(JSON.stringify(walkA)).toBe(JSON.stringify(walkB));
    const fault = { [plan.legs[2]?.legId ?? ""]: { kind: "FIAT_OUTCOME_UNKNOWN" as const, reason: "the fixture provider could not observe the payout" } };
    const faultedA = walkRoutePlan({ plan, at: NOW, observedAtIso: "2026-10-03T00:00:01Z", faults: fault });
    const faultedB = walkRoutePlan({ plan, at: NOW, observedAtIso: "2026-10-03T00:00:01Z", faults: fault });
    expect(JSON.stringify(faultedA)).toBe(JSON.stringify(faultedB));
  });

  it("a different `at` yields a different digest; malformed instants are refused", () => {
    const intent = route1Intent();
    const first = compileMoneyMovementRoute(baseCompilerInput(intent));
    const later = compileMoneyMovementRoute({ ...baseCompilerInput(intent), at: NOW + 1000 });
    expect(later.compilationDigest).not.toBe(first.compilationDigest);
    expect(() => compileMoneyMovementRoute({ ...baseCompilerInput(intent), at: -1 })).toThrowError(RouteCompilerInputError);
    expect(() => compileMoneyMovementRoute({ ...baseCompilerInput(intent), at: Number.NaN })).toThrowError(RouteCompilerInputError);
  });

  it("an expired authorization window compiles nothing (fail closed)", () => {
    const intent = route1Intent();
    expect(() =>
      compileMoneyMovementRoute({ ...baseCompilerInput(intent), at: intent.expiresAt }),
    ).toThrowError(/expired authorization window/);
  });

  it("NET-NEW observation-VERSION fingerprint: same versions -> same fingerprint; any version change -> different", () => {
    const pins = [
      { instanceId: "instance:psp-native:001", observationVersion: 1, pinnedDigest: "fnv1a64:aaaa1111aaaa1111" },
      { instanceId: "instance:psp-payouts:001", observationVersion: 2, pinnedDigest: "fnv1a64:bbbb2222bbbb2222" },
    ];
    const first = observationVersionFingerprint(pins);
    expect(observationVersionFingerprint([...pins])).toBe(first);
    expect(observationVersionFingerprint(pins.slice().reverse())).toBe(first);
    expect(
      observationVersionFingerprint([
        { instanceId: "instance:psp-native:001", observationVersion: 3, pinnedDigest: "fnv1a64:aaaa1111aaaa1111" },
        { instanceId: "instance:psp-payouts:001", observationVersion: 2, pinnedDigest: "fnv1a64:bbbb2222bbbb2222" },
      ]),
    ).not.toBe(first);
    expect(
      observationVersionFingerprint([
        { instanceId: "instance:psp-native:001", observationVersion: 1, pinnedDigest: "fnv1a64:cccc3333cccc3333" },
        { instanceId: "instance:psp-payouts:001", observationVersion: 2, pinnedDigest: "fnv1a64:bbbb2222bbbb2222" },
      ]),
    ).not.toBe(first);
  });

  it("NET-NEW the compilation result pins the EXACT observation versions it decided on", () => {
    const result = compileBase(route1Intent());
    const fingerprints = new Set(
      result.observationVersionPins.map((pin) => `${pin.instanceId}@${pin.observationVersion}`),
    );
    expect(fingerprints.has("instance:psp-native:001@1")).toBe(true);
    expect(fingerprints.has("instance:psp-payouts:001@2")).toBe(true);
    expect(fingerprints.has("fundsloc:route-1-origin-wallet@1")).toBe(true);
  });

  it("a changed intent yields a different digest (input sensitivity)", () => {
    const first = compileMoneyMovementRoute(baseCompilerInput(route1Intent()));
    const changedIntent = { ...route1Intent(), intentId: "intent:route-1:variant" };
    const second = compileMoneyMovementRoute(baseCompilerInput(changedIntent));
    expect(second.compilationDigest).not.toBe(first.compilationDigest);
  });
});
