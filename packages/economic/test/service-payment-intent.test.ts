/**
 * ServiceAccessIntent + PaymentIntent validation tests (P1-W1, net-new
 * contracts). PaymentIntent is the TYPE-LEVEL specialization of
 * MoneyMovementIntent ONLY (no payment-method machinery — P5-W3): the
 * commerceRef-carrying shape must FAIL the bare movement validator
 * (fail-closed split) and PASS the payment validator with the exact
 * 11-field key set. ServiceAccessIntent carries NO funding machinery
 * (credential isolation, old SERVICE-CAPABILITIES.md law).
 */

import { describe, expect, it } from "vitest";
import {
  InvalidMoneyMovementIntentError,
  InvalidPaymentIntentError,
  InvalidServiceAccessIntentError,
  validateMoneyMovementIntent,
  validatePaymentIntent,
  validateServiceAccessIntent,
  asMoneyMovementIntent,
  PAYMENT_INTENT_KEYS,
  SERVICE_ACCESS_INTENT_KEYS,
} from "../src/index.ts";
import { paymentIntent, serviceIntent, movementIntent } from "./fixtures.ts";

describe("PaymentIntent (type-level specialization of MoneyMovementIntent ONLY)", () => {
  it("accepts the fixture payment intent, frozen, with the exact 11-field key set", () => {
    const validated = validatePaymentIntent(paymentIntent());
    expect(validated).toEqual(paymentIntent());
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.keys(validated).sort()).toEqual([...PAYMENT_INTENT_KEYS].sort());
    expect(Object.keys(validated)).toHaveLength(11);
  });

  it("FAIL-CLOSED SPLIT: the commerceRef-carrying shape is rejected by the bare movement validator", () => {
    expect(() => validateMoneyMovementIntent(paymentIntent())).toThrow(
      InvalidMoneyMovementIntentError,
    );
    expect(() => validateMoneyMovementIntent(paymentIntent())).toThrow(
      /must carry exactly the fields/,
    );
  });

  it("rejects invalid payment intents fail-closed (movement law + commerceRef law)", () => {
    expect(() => validatePaymentIntent(null)).toThrow(InvalidPaymentIntentError);
    expect(() => validatePaymentIntent({ ...paymentIntent(), commerceRef: "" })).toThrow(
      /commerceRef/,
    );
    expect(() =>
      validatePaymentIntent({ ...paymentIntent(), commerceRef: "x", extra: 1 }),
    ).toThrow(/exactly the fields/);
    expect(() =>
      validatePaymentIntent({ ...paymentIntent(), originAmount: { currency: "ETH", minorUnits: "0" } }),
    ).toThrow(InvalidPaymentIntentError);
    expect(() =>
      validatePaymentIntent({ ...paymentIntent(), arrivalCurrency: "USD" }),
    ).toThrow(InvalidPaymentIntentError);
  });

  it("a validated PaymentIntent IS a MoneyMovementIntent (type-level assignability)", () => {
    const payment = validatePaymentIntent(paymentIntent());
    const movement = asMoneyMovementIntent(payment);
    expect(() => validateMoneyMovementIntent(movement)).not.toThrow();
    // The movement view is exactly the payment minus the commerce lineage.
    const { commerceRef: _commerce, ...movementView } = paymentIntent();
    void _commerce;
    expect(movement).toEqual(movementView);
    expect(movement).not.toHaveProperty("commerceRef");
    expect(movement.intentId).toBe(payment.intentId);
  });
});

describe("ServiceAccessIntent (no funding machinery — credential isolation)", () => {
  it("accepts the fixture service intent, frozen, with the exact key set (with maxCost)", () => {
    const validated = validateServiceAccessIntent(serviceIntent());
    expect(validated).toEqual(serviceIntent());
    expect(Object.isFrozen(validated)).toBe(true);
    expect(Object.keys(validated).sort()).toEqual(
      [...SERVICE_ACCESS_INTENT_KEYS].sort(),
    );
    expect(Object.keys(validated)).toHaveLength(9);
  });

  it("accepts the optional maxCost ABSENT (8-field key set)", () => {
    const { maxCost: _omitted, ...withoutCost } = serviceIntent();
    void _omitted;
    const validated = validateServiceAccessIntent(withoutCost);
    expect(validated.maxCost).toBeUndefined();
    expect(Object.keys(validated)).toHaveLength(8);
    expect(validated.serviceRef).toBe("service:video:standard-plan");
  });

  it("rejects invalid service intents fail-closed", () => {
    expect(() => validateServiceAccessIntent(null)).toThrow(InvalidServiceAccessIntentError);
    expect(() => validateServiceAccessIntent("nope")).toThrow(
      InvalidServiceAccessIntentError,
    );
    expect(() =>
      validateServiceAccessIntent({ ...serviceIntent(), serviceRef: "" }),
    ).toThrow(/serviceRef/);
    expect(() =>
      validateServiceAccessIntent({ ...serviceIntent(), beneficiaryRef: "" }),
    ).toThrow(/beneficiaryRef/);
    expect(() =>
      validateServiceAccessIntent({
        ...serviceIntent(),
        maxCost: { currency: "usd", minorUnits: "1" },
      }),
    ).toThrow(/maxCost must be a canonical exact-integer AmountSpec/);
    expect(() =>
      validateServiceAccessIntent({ ...serviceIntent(), fundingRef: "acct-x" }),
    ).toThrow(/exactly the fields/);
  });

  it("carries NO funding machinery (no funding/payment-method fields can smuggle in)", () => {
    const serialized = JSON.stringify(validateServiceAccessIntent(serviceIntent())).toLowerCase();
    for (const forbidden of ["fundingref", "paymentmethod", "card", "credential"]) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
  });

  it("rejects expiresAt <= declaredAt (the ported window law)", () => {
    const base = serviceIntent();
    expect(() =>
      validateServiceAccessIntent({ ...base, expiresAt: base.declaredAt }),
    ).toThrow(/expiresAt must be strictly after declaredAt/);
  });
});
