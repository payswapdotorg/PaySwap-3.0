import { describe, expect, it } from "vitest";
import { validateMoneyMovementIntent, intentCarriesNoCustodyState } from "../src/intent.ts";
import { InvalidMoneyMovementIntentError } from "../src/errors.ts";
import { route1Intent, route2Intent, route3Intent, route4Intent } from "./fixtures.ts";

/**
 * Money Movement Intent validation (ADAPT of the old intent suite onto
 * the neutral pin: fail closed, never repairs — the closed 10-key set,
 * exact-integer amounts, currency matches at both ends, bounded
 * constraints, expiry strictly after declaration).
 */
describe("MoneyMovementIntent validation (fail closed, never repairs)", () => {
  it("rejects non-objects and arrays", () => {
    for (const bad of [null, undefined, 42, "intent", [], true]) {
      expect(() => validateMoneyMovementIntent(bad)).toThrowError(InvalidMoneyMovementIntentError);
    }
  });

  it("rejects empty or missing identity fields", () => {
    for (const field of ["intentId", "principalRef", "intentAuthorizationRef"]) {
      const intent = { ...route1Intent(), [field]: "" };
      expect(() => validateMoneyMovementIntent(intent)).toThrowError(InvalidMoneyMovementIntentError);
    }
  });

  it("rejects unknown and missing keys (the closed key set is the no-secret-material law)", () => {
    expect(() => validateMoneyMovementIntent({ ...route1Intent(), extraField: "x" })).toThrowError(
      /exactly the keys/,
    );
    const { intentId, ...withoutIntentId } = route1Intent();
    void intentId;
    expect(() => validateMoneyMovementIntent(withoutIntentId)).toThrowError(/exactly the keys/);
  });

  it("rejects malformed funds-location references (three keys exactly, currency codes)", () => {
    expect(() =>
      validateMoneyMovementIntent({ ...route1Intent(), origin: { locationRef: "x", currency: "ETH" } }),
    ).toThrowError(InvalidMoneyMovementIntentError);
    expect(() =>
      validateMoneyMovementIntent({
        ...route1Intent(),
        origin: { locationRef: "x", currency: "eth", observationRef: "y" },
      }),
    ).toThrowError(/three-letter uppercase/);
  });

  it("rejects zero, malformed and mismatched origin amounts (INV-F01)", () => {
    expect(() =>
      validateMoneyMovementIntent({ ...route1Intent(), originAmount: { currency: "ETH", minorUnits: "0" } }),
    ).toThrowError(/positive/);
    expect(() =>
      validateMoneyMovementIntent({ ...route1Intent(), originAmount: { currency: "ETH", minorUnits: "1.5" } }),
    ).toThrowError(InvalidMoneyMovementIntentError);
    expect(() =>
      validateMoneyMovementIntent({ ...route1Intent(), originAmount: { currency: "EUR", minorUnits: "10" } }),
    ).toThrowError(/must match the origin location currency/);
  });

  it("rejects arrival-currency mismatch with the destination (all fixture intents agree)", () => {
    expect(() =>
      validateMoneyMovementIntent({ ...route1Intent(), arrivalCurrency: "USD" }),
    ).toThrowError(/must match the destination location currency/);
  });

  it("rejects non-positive time budgets and unbounded hops", () => {
    expect(() =>
      validateMoneyMovementIntent({
        ...route1Intent(),
        constraints: { maxSettlementMs: 0, maxRouteHops: 4 },
      }),
    ).toThrowError(/maxSettlementMs/);
    for (const hops of [0, 9, 2.5]) {
      expect(() =>
        validateMoneyMovementIntent({
          ...route1Intent(),
          constraints: { maxSettlementMs: 600000, maxRouteHops: hops },
        }),
      ).toThrowError(InvalidMoneyMovementIntentError);
    }
  });

  it("rejects expired or non-positive authorization windows", () => {
    const intent = route1Intent();
    expect(() =>
      validateMoneyMovementIntent({ ...intent, expiresAt: intent.declaredAt }),
    ).toThrowError(/strictly after declaredAt/);
    expect(() =>
      validateMoneyMovementIntent({ ...intent, expiresAt: intent.declaredAt - 1 }),
    ).toThrowError(/strictly after declaredAt/);
    expect(() =>
      validateMoneyMovementIntent({ ...intent, declaredAt: -1 }),
    ).toThrowError(InvalidMoneyMovementIntentError);
  });

  it("accepts all four fixture intents frozen with exactly the ten canonical keys", () => {
    for (const intent of [route1Intent(), route2Intent(), route3Intent(), route4Intent()]) {
      const validated = validateMoneyMovementIntent(intent);
      expect(Object.keys(validated).sort()).toEqual([
        "arrivalCurrency",
        "constraints",
        "declaredAt",
        "destination",
        "expiresAt",
        "intentAuthorizationRef",
        "intentId",
        "origin",
        "originAmount",
        "principalRef",
      ]);
      expect(Object.isFrozen(validated)).toBe(true);
      expect(Object.isFrozen(validated.origin)).toBe(true);
    }
  });

  it("the intent carries NO balance, custody, lock or hold (INV-7)", () => {
    for (const intent of [route1Intent(), route2Intent(), route3Intent(), route4Intent()]) {
      expect(intentCarriesNoCustodyState(validateMoneyMovementIntent(intent))).toBe(true);
    }
  });

  it("rail/provider-identifying vocabulary is unrepresentable on the neutral intent", () => {
    const serialized = JSON.stringify(validateMoneyMovementIntent(route1Intent()));
    for (const railWord of ["ONCHAIN_WALLET", "EXTERNAL_PROVIDER_ACCOUNT", "BANK_ACCOUNT", "chainKey", "providerName", "stripe"]) {
      expect(serialized.includes(railWord)).toBe(false);
    }
  });

  it("amount minor units are canonical integer strings only (no signs, points, leading zeros)", () => {
    for (const bad of ["-10", "+10", "01", "1e3", " 10", ""]) {
      expect(() =>
        validateMoneyMovementIntent({
          ...route1Intent(),
          originAmount: { currency: "ETH", minorUnits: bad },
        }),
      ).toThrowError(InvalidMoneyMovementIntentError);
    }
  });

  it("location observations are referenced opaquely (the observation plane owns rail meaning)", () => {
    const validated = validateMoneyMovementIntent(route2Intent());
    expect(validated.origin.observationRef).toBe("obs:route-2-origin");
    expect(validated.destination.observationRef).toBe("obs:route-2-destination");
    expect(validated.origin.locationRef.startsWith("fundsloc:")).toBe(true);
  });
});
