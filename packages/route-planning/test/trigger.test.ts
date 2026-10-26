import { describe, expect, it } from "vitest";
import {
  buildRoutePlanningTrigger,
  RoutePlanningTriggerRegistry,
  triggerPermitsExecution,
  TriggerConflictError,
  TriggerIntentError,
  ROUTINE_TRIGGER_INTENT_KINDS,
} from "../src/trigger.ts";
import { contentDigest } from "../src/canonical.ts";
import { RoutePlanningValidationError } from "../src/errors.ts";
import { validateRoutePlanningIntent } from "../src/hard-gates.ts";
import {
  hasPinnedIntentKeySet,
  hasPinnedPaymentIntentKeySet,
} from "../src/pins/economic.ts";
import { movementIntentFixture, NOW, paymentIntentFixture } from "./fixtures.ts";

/**
 * The typed routine trigger battery (ROUTINE-CONTRACT Appendix A.1;
 * ADR-0009 D1): prose is UNCONSTRUCTIBLE, the closed key set is
 * re-validated fail-closed with the typed TriggerIntentError, the two
 * value-form digests are re-derived deterministically, one idempotency
 * key admits at most one start (identical re-records replay, divergent
 * re-records conflict), and the trigger NEVER permits execution.
 */

const INPUT = { idempotencyKey: "idem:routine:001", acceptedAt: NOW - 1_000 };

describe("the typed routine trigger (Appendix A.1)", () => {
  it("a movement intent builds a MONEY_MOVEMENT trigger with exactly the six-key closed surface, deep-frozen", () => {
    const trigger = buildRoutePlanningTrigger(movementIntentFixture(), INPUT);
    expect(Object.keys(trigger).sort()).toEqual([
      "acceptedAt", "hardConstraintsDigest", "idempotencyKey", "intentDigest", "intentId", "intentKind",
    ]);
    expect(trigger.intentKind).toBe("MONEY_MOVEMENT");
    expect(trigger.intentId).toBe("intent:planning:001");
    expect(trigger.idempotencyKey).toBe(INPUT.idempotencyKey);
    expect(trigger.acceptedAt).toBe(INPUT.acceptedAt);
    expect(trigger.intentDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(trigger.hardConstraintsDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(Object.isFrozen(trigger)).toBe(true);
    expect(ROUTINE_TRIGGER_INTENT_KINDS).toEqual(["MONEY_MOVEMENT", "PAYMENT"]);
  });

  it("a payment intent (commerceRef present) is a PAYMENT trigger and is NOT a valid bare movement record (the fail-closed split)", () => {
    const payment = paymentIntentFixture();
    expect(hasPinnedPaymentIntentKeySet(payment)).toBe(true);
    expect(hasPinnedIntentKeySet(payment)).toBe(false);
    expect(() => validateRoutePlanningIntent(payment)).toThrow(RoutePlanningValidationError);
    const trigger = buildRoutePlanningTrigger(payment, INPUT);
    expect(trigger.intentKind).toBe("PAYMENT");
    const movement = buildRoutePlanningTrigger(movementIntentFixture(), INPUT);
    expect(trigger.intentKind).not.toBe(movement.intentKind);
    // The commerceRef key IS the specialization: adding it to a movement
    // record makes the payment shape (and vice versa, stripping makes movement).
    expect(Object.keys(payment)).toContain("commerceRef");
  });

  it("prose, malformed records and non-pin shapes are UNCONSTRUCTIBLE (typed TriggerIntentError, fail closed)", () => {
    const cases: unknown[] = [
      "pay alice 5 EUR please",
      null,
      42,
      { ...movementIntentFixture(), extraField: "no" },
      { ...movementIntentFixture(), intentId: undefined },
      { ...movementIntentFixture(), constraints: { maxRouteHops: 99, maxSettlementMs: 1 } },
      { ...movementIntentFixture(), originAmount: { currency: "ETH", minorUnits: "0" } },
      { ...movementIntentFixture(), declaredAt: NOW, expiresAt: NOW - 1 },
    ];
    for (const candidate of cases) {
      expect(() =>
        buildRoutePlanningTrigger(candidate as never, INPUT),
      ).toThrow(TriggerIntentError);
    }
  });

  it("both digests are the re-derivable value-form digests (deterministic; ADR-0009 D4)", () => {
    const movement = movementIntentFixture();
    const payment = paymentIntentFixture();
    const trigger = buildRoutePlanningTrigger(movement, INPUT);
    expect(trigger.intentDigest).toBe(contentDigest(movement));
    expect(trigger.hardConstraintsDigest).toBe(
      contentDigest({ constraints: movement.constraints, expiresAt: movement.expiresAt }),
    );
    // The payment intent's digest covers the FULL value (commerceRef included).
    const paymentTrigger = buildRoutePlanningTrigger(payment, INPUT);
    expect(paymentTrigger.intentDigest).toBe(contentDigest(payment));
    expect(paymentTrigger.intentDigest).not.toBe(trigger.intentDigest);
    // Identical inputs replay byte-identically; a different intent moves the digest.
    expect(buildRoutePlanningTrigger(movement, INPUT).intentDigest).toBe(trigger.intentDigest);
    const changed = { ...movement, originAmount: { currency: "ETH", minorUnits: "20000000000000000" } };
    const changedTrigger = buildRoutePlanningTrigger(changed, INPUT);
    expect(changedTrigger.intentDigest).not.toBe(trigger.intentDigest);
    expect(changedTrigger.hardConstraintsDigest).toBe(trigger.hardConstraintsDigest);
  });

  it("the registry: first record starts, identical re-record replays, divergent re-record conflicts (one key, one start)", () => {
    const registry = new RoutePlanningTriggerRegistry();
    const trigger = buildRoutePlanningTrigger(movementIntentFixture(), INPUT);
    const first = registry.recordStart(trigger);
    expect(first).toEqual({ started: true, startedAt: INPUT.acceptedAt });
    const replay = registry.recordStart(trigger);
    expect(replay).toEqual({ started: false, startedAt: INPUT.acceptedAt });
    const divergent = buildRoutePlanningTrigger(
      { ...movementIntentFixture(), originAmount: { currency: "ETH", minorUnits: "999000000000000" } },
      INPUT,
    );
    expect(() => registry.recordStart(divergent)).toThrow(TriggerConflictError);
    let conflict: TriggerConflictError | undefined;
    try {
      registry.recordStart(divergent);
    } catch (error) {
      conflict = error as TriggerConflictError;
    }
    expect((conflict as TriggerConflictError & { details?: unknown } | undefined)?.details).toMatchObject({
      idempotencyKey: INPUT.idempotencyKey,
      existing: { intentId: "intent:planning:001", startedAt: INPUT.acceptedAt },
      attempted: { intentId: "intent:planning:001" },
    });
    // The honest lookup: started with the original instant; null when absent.
    expect(registry.startedFor(INPUT.idempotencyKey)).toEqual({ started: true, startedAt: INPUT.acceptedAt });
    expect(registry.startedFor("idem:never:recorded")).toEqual({ started: false, startedAt: null });
    // A DIFFERENT key starts its own routine (per-key idempotency).
    const otherKey = registry.recordStart(
      buildRoutePlanningTrigger(movementIntentFixture(), { idempotencyKey: "idem:routine:002", acceptedAt: NOW }),
    );
    expect(otherKey).toEqual({ started: true, startedAt: NOW });
  });

  it("the trigger NEVER permits execution (the literal false companion)", () => {
    expect(triggerPermitsExecution()).toBe(false);
    const trigger = buildRoutePlanningTrigger(paymentIntentFixture(), INPUT);
    expect(Object.keys(trigger)).not.toContain("prose");
    expect(JSON.stringify(trigger)).not.toContain("pay alice");
  });

  it("fail-closed caller inputs: non-integer instants and empty keys never construct a trigger", () => {
    for (const acceptedAt of [1.5, -1, Number.NaN, "now", null]) {
      expect(() =>
        buildRoutePlanningTrigger(movementIntentFixture(), { idempotencyKey: "k", acceptedAt: acceptedAt as never }),
      ).toThrow(RoutePlanningValidationError);
    }
    for (const idempotencyKey of ["", 42, null]) {
      expect(() =>
        buildRoutePlanningTrigger(movementIntentFixture(), { idempotencyKey: idempotencyKey as never, acceptedAt: NOW }),
      ).toThrow(RoutePlanningValidationError);
    }
  });

  it("the registry re-validates the trigger record's closed surface (a tampered record fails typed)", () => {
    const registry = new RoutePlanningTriggerRegistry();
    const trigger = buildRoutePlanningTrigger(movementIntentFixture(), INPUT);
    const tampered: Record<string, unknown> = { ...trigger };
    delete tampered["hardConstraintsDigest"];
    expect(() => registry.recordStart(tampered as never)).toThrow(TriggerIntentError);
    const badDigest: Record<string, unknown> = { ...trigger, intentDigest: "not-a-digest" };
    expect(() => registry.recordStart(badDigest as never)).toThrow(TriggerIntentError);
    const badKind: Record<string, unknown> = { ...trigger, intentKind: "FREE_TEXT" };
    expect(() => registry.recordStart(badKind as never)).toThrow(TriggerIntentError);
    expect(() => registry.startedFor("")).toThrow(TriggerIntentError);
  });
});
