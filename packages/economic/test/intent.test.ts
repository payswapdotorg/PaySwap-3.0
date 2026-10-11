/**
 * The canonical Money Movement Intent validation laws (P1-W1).
 *
 * PORT/ADAPT of payswap.org@8a735bf packages/route-compiler/test/intent.test.ts
 * (326 lines) onto the rail/provider-neutral contract: the old suite's
 * fail-closed discipline is preserved law-for-law and extended with the
 * neutrality law —
 *
 * - identity fields are non-empty strings (intentId, principalRef,
 *   intentAuthorizationRef) — an intent without identity or without its
 *   authorization lineage artifact reference is nothing;
 * - origins and destinations are OBSERVATION-GROUNDED references
 *   (locationRef + currency + observationRef, exact key set) — never
 *   balances, never custody, and never rail/provider-identifying structures
 *   (the old ONCHAIN_WALLET/BANK_ACCOUNT/STRIPE_* vocabulary is rejected as
 *   unknown fields — the neutrality law is structural);
 * - money is exact: /^[A-Z]{3}$/ currencies (the AmountSpec law), a
 *   POSITIVE integer-minor-unit originAmount whose currency matches the
 *   origin location, and an arrivalCurrency that matches the destination;
 * - timing is bounded: positive maxSettlementMs, an integer maxRouteHops in
 *   [1, 8] (an unbounded hop count is never authorized), and an expiry
 *   strictly after the declaration instant;
 * - the validated intent is FROZEN and carries EXACTLY the 10 canonical
 *   fields — no balance, no custody, no execution/routing semantics.
 */

import { describe, expect, it } from "vitest";
import {
  archetypeSatisfies,
  InvalidMoneyMovementIntentError,
  validateFundsLocationRef,
  validateIntentConstraints,
  validateMoneyMovementIntent,
  type MoneyMovementIntent,
} from "../src/index.ts";
import { movementIntent } from "./fixtures.ts";

/** The 10 canonical fields — and NOTHING else. */
const CANONICAL_INTENT_KEYS = [
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
] as const;

function expectReject(candidate: unknown, message: RegExp): void {
  expect(() => validateMoneyMovementIntent(candidate)).toThrow(
    InvalidMoneyMovementIntentError,
  );
  expect(() => validateMoneyMovementIntent(candidate)).toThrow(message);
}

/** One-field mutation of the valid base (shallow or one level deep). */
function mutated(
  base: MoneyMovementIntent,
  patch: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...base, ...patch };
}

describe("MoneyMovementIntent validation (fail closed, never repairs)", () => {
  it("rejects null, undefined and non-object candidates", () => {
    expectReject(null, /a Money Movement Intent is required/);
    expectReject(undefined, /a Money Movement Intent is required/);
    expectReject("intent:1", /a Money Movement Intent is required/);
    expectReject(42, /a Money Movement Intent is required/);
    // An array is structurally an object but carries no intent fields —
    // fail-closed at the object gate, never accepted.
    expect(() => validateMoneyMovementIntent([])).toThrow(
      InvalidMoneyMovementIntentError,
    );
    expect(() => validateMoneyMovementIntent([])).toThrow(/a Money Movement Intent is required/);
  });

  it("rejects empty identity fields (intentId, principalRef, intentAuthorizationRef)", () => {
    expectReject(mutated(movementIntent(), { intentId: "" }), /intentId/);
    expectReject(mutated(movementIntent(), { principalRef: "" }), /principalRef/);
    expectReject(
      mutated(movementIntent(), { intentAuthorizationRef: "" }),
      /intentAuthorizationRef/,
    );
  });

  it("rejects unknown fields on the intent (closed key set)", () => {
    expectReject(
      mutated(movementIntent(), { railHint: "SEPA" }),
      /must carry exactly the fields/,
    );
    expectReject(
      mutated(movementIntent(), { providerName: "wise" }),
      /must carry exactly the fields/,
    );
  });

  it("NEUTRALITY LAW: rejects the old rail/provider-identifying structures as unknown fields", () => {
    // The old ONCHAIN_WALLET origin shape must FAIL the neutral contract.
    expectReject(
      mutated(movementIntent(), {
        origin: { kind: "ONCHAIN_WALLET", chainKey: "ethereum:mainnet", accountRef: "0x1", assetId: "a", symbol: "ETH" },
      }),
      /exactly the fields \[currency, locationRef, observationRef\]/,
    );
    // The old BANK_ACCOUNT destination shape must FAIL the neutral contract.
    expectReject(
      mutated(movementIntent(), {
        destination: { kind: "BANK_ACCOUNT", externalRef: "iban:DE89", currency: "EUR" },
      }),
      /exactly the fields \[currency, locationRef, observationRef\]/,
    );
    // The old STRIPE_MERCHANT_BALANCE destination shape must FAIL too.
    expectReject(
      mutated(movementIntent(), {
        destination: { kind: "STRIPE_MERCHANT_BALANCE", stripeAccountRef: "acct-1", currency: "USD" },
      }),
      /exactly the fields \[currency, locationRef, observationRef\]/,
    );
  });

  it("rejects malformed funds-location references (origin and destination)", () => {
    expectReject(mutated(movementIntent(), { origin: null }), /origin/);
    expectReject(
      mutated(movementIntent(), {
        origin: { ...movementIntent().origin, locationRef: "" },
      }),
      /origin\.locationRef/,
    );
    expectReject(
      mutated(movementIntent(), {
        origin: { ...movementIntent().origin, currency: "eth" },
      }),
      /origin\.currency.*3-letter/,
    );
    expectReject(
      mutated(movementIntent(), {
        destination: { ...movementIntent().destination, observationRef: "" },
      }),
      /destination\.observationRef/,
    );
    expectReject(
      mutated(movementIntent(), {
        origin: { ...movementIntent().origin, extra: "x" },
      }),
      /origin must carry exactly the fields/,
    );
  });

  it("rejects a zero origin amount (a value transfer moves value)", () => {
    expectReject(
      mutated(movementIntent(), { originAmount: { currency: "ETH", minorUnits: "0" } }),
      /must be positive — a value transfer moves value/,
    );
    expectReject(
      mutated(movementIntent(), { originAmount: undefined }),
      /originAmount must be a canonical exact-integer AmountSpec/,
    );
    expectReject(
      mutated(movementIntent(), { originAmount: { currency: "ETH", minorUnits: "-5" } }),
      /originAmount must be a canonical exact-integer AmountSpec/,
    );
    expectReject(
      mutated(movementIntent(), { originAmount: { currency: "ETH", minorUnits: "1.5" } }),
      /originAmount must be a canonical exact-integer AmountSpec/,
    );
  });

  it("rejects an originAmount currency that does not match the origin location currency", () => {
    expectReject(
      mutated(movementIntent(), {
        originAmount: { currency: "USC", minorUnits: "1000000" },
      }),
      /originAmount currency 'USC' must match the origin location currency 'ETH'/,
    );
  });

  it("rejects an arrivalCurrency that does not match the destination", () => {
    expectReject(
      mutated(movementIntent(), { arrivalCurrency: "USD" }),
      /arrivalCurrency 'USD' must match the destination location currency 'EUR'/,
    );
    expectReject(
      mutated(movementIntent(), { arrivalCurrency: "EURO" }),
      /3-letter/,
    );
  });

  it("rejects non-positive or non-integer maxSettlementMs", () => {
    expectReject(
      mutated(movementIntent(), { constraints: { maxSettlementMs: 0, maxRouteHops: 6 } }),
      /maxSettlementMs must be a positive integer/,
    );
    expectReject(
      mutated(movementIntent(), { constraints: { maxSettlementMs: -1, maxRouteHops: 6 } }),
      /maxSettlementMs must be a positive integer/,
    );
    expectReject(
      mutated(movementIntent(), { constraints: { maxSettlementMs: 1.5, maxRouteHops: 6 } }),
      /maxSettlementMs must be a safe integer/,
    );
  });

  it("rejects maxRouteHops 0, 9 and non-integers (bounded hops only)", () => {
    expectReject(
      mutated(movementIntent(), { constraints: { maxSettlementMs: 600_000, maxRouteHops: 0 } }),
      /maxRouteHops must be an integer in \[1, 8\]/,
    );
    expectReject(
      mutated(movementIntent(), { constraints: { maxSettlementMs: 600_000, maxRouteHops: 9 } }),
      /maxRouteHops must be an integer in \[1, 8\]/,
    );
    expectReject(
      mutated(movementIntent(), { constraints: { maxSettlementMs: 600_000, maxRouteHops: 2.5 } }),
      /maxRouteHops must be an integer in \[1, 8\]/,
    );
    expectReject(
      mutated(movementIntent(), { constraints: { maxSettlementMs: 600_000, maxRouteHops: "six" } }),
      /maxRouteHops must be an integer in \[1, 8\]/,
    );
  });

  it("rejects expiresAt <= declaredAt (an expired window compiles nothing)", () => {
    const base = movementIntent();
    expectReject(
      mutated(base, { expiresAt: base.declaredAt }),
      /expiresAt must be strictly after declaredAt/,
    );
    expectReject(
      mutated(base, { expiresAt: base.declaredAt - 1 }),
      /expiresAt must be strictly after declaredAt/,
    );
  });

  it("accepts the fixture intent, frozen and value-faithful", () => {
    const validated = validateMoneyMovementIntent(movementIntent());
    expect(validated).toEqual(movementIntent());
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.isFrozen(validated.origin)).toBe(true);
    expect(Object.isFrozen(validated.destination)).toBe(true);
    expect(Object.isFrozen(validated.constraints)).toBe(true);
    // The exact canonical key set — nothing more, nothing less.
    expect(Object.keys(validated).sort()).toEqual([...CANONICAL_INTENT_KEYS]);
  });

  it("the intent carries NO balance/custody state — it is references only", () => {
    const validated = validateMoneyMovementIntent(movementIntent());
    const serialized = JSON.stringify(validated).toLowerCase();
    for (const forbidden of ["balance", "available", "held", "custody", "locked"]) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
    // The frozen object exposes exactly the 10 canonical fields: no key can
    // smuggle balance/custody/routing state onto the single source of truth.
    expect(Object.keys(validated)).toHaveLength(10);
    expect(Object.keys(validated.origin).sort()).toEqual([
      "currency",
      "locationRef",
      "observationRef",
    ]);
    expect(Object.keys(validated.destination).sort()).toEqual([
      "currency",
      "locationRef",
      "observationRef",
    ]);
    expect(Object.keys(validated.originAmount).sort()).toEqual(["currency", "minorUnits"]);
    expect(Object.keys(validated.constraints).sort()).toEqual(["maxRouteHops", "maxSettlementMs"]);
  });

  it("same-location origin/destination is ACCEPTED (in-place conversion is a legitimate demand)", () => {
    const base = movementIntent();
    const inPlace = validateMoneyMovementIntent({
      ...base,
      destination: { locationRef: base.origin.locationRef, currency: "USC", observationRef: "obs:chain-usc:1" },
      arrivalCurrency: "USC",
    });
    expect(inPlace.destination.locationRef).toBe(inPlace.origin.locationRef);
  });
});

describe("shared structural validators", () => {
  it("validateFundsLocationRef validates the exact 3-field reference shape", () => {
    const ref = validateFundsLocationRef(
      { locationRef: "fundsloc:x", currency: "EUR", observationRef: "obs:1" },
      "test.ref",
    );
    expect(Object.isFrozen(ref)).toBe(true);
    expect(() => validateFundsLocationRef({ locationRef: "fundsloc:x" }, "test.ref")).toThrow(
      InvalidMoneyMovementIntentError,
    );
  });

  it("validateIntentConstraints enforces the bounded constraint law", () => {
    expect(validateIntentConstraints({ maxSettlementMs: 1, maxRouteHops: 8 })).toEqual({
      maxSettlementMs: 1,
      maxRouteHops: 8,
    });
    expect(() => validateIntentConstraints({ maxSettlementMs: 1, maxRouteHops: 1 })).not.toThrow();
    expect(() => validateIntentConstraints({ maxSettlementMs: 1 })).toThrow(
      /exactly the fields/,
    );
  });

  it("archetypeSatisfies: PAYMENT satisfies MONEY_MOVEMENT; the reverse does not", () => {
    expect(archetypeSatisfies("PAYMENT", "MONEY_MOVEMENT")).toBe(true);
    expect(archetypeSatisfies("MONEY_MOVEMENT", "PAYMENT")).toBe(false);
    expect(archetypeSatisfies("SERVICE_ACCESS", "SERVICE_ACCESS")).toBe(true);
    expect(archetypeSatisfies("SERVICE_ACCESS", "MONEY_MOVEMENT")).toBe(false);
    expect(archetypeSatisfies("MONEY_MOVEMENT", "MONEY_MOVEMENT")).toBe(true);
  });
});
