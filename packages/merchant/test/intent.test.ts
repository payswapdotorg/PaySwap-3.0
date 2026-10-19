/**
 * @payswap/merchant — the merchant payment intent suite (P5-W3, lane
 * R3-W3, Task 3-c; PORT of old packages/merchant-crypto
 * test/intent.test.ts @ 8a735bf — 12 sites -> 12 sites).
 *
 * The machine (PORTED, error taxonomy + record shape ADAPTED to the
 * local kernel: MachineTransitionError/MachineGuardError instead of
 * IllegalTransitionError/TransitionGuardError/TerminalStateViolationError,
 * transition records are {from,on,to} without viaRecovery):
 * the full legal walk to SUCCEEDED; EXPIRE guarded to now >= expiresAt
 * (fails before the boundary, passes AT the boundary — from both
 * pre-method states); CANCEL from the three non-terminal pre-states;
 * OUTCOME_UNKNOWN as a first-class non-terminal reachable from
 * PROCESSING and exited ONLY through RESOLVE_*; terminal-state
 * monotonicity; and PROCESSING deliberately has NO EXPIRE transition —
 * a submitted payment cannot be un-sent by the clock.
 *
 * The constructor (PORTED): frozen REQUIRES_PAYMENT_METHOD initial
 * state, positive exact money, expiry strictly after creation,
 * non-empty refs (empty ids throw the branded-id error, empty refs the
 * validation error — ADAPTED to the local taxonomy).
 */

import { describe, expect, it } from "vitest";
import {
  defineMerchantPaymentIntent,
  merchantPaymentIntentStateMachine,
} from "../src/index.ts";
import type { MerchantPaymentIntentMachineContext } from "../src/index.ts";
import {
  InvalidIdentifierError,
  MachineGuardError,
  MachineTransitionError,
  ValidationError,
} from "../src/errors.ts";
import { T0, T60, usd } from "./fixtures.ts";
import { intentFixture } from "./journey-fixtures.ts";

/** Guard context pinned to the fixture clock (T0 -> T60 is one hour). */
const context = {
  now: T0,
  expiresAt: T60,
} satisfies MerchantPaymentIntentMachineContext;

/** The ported base input (old baseIntentInput, EUR -> fixture USD). */
function baseIntentInput() {
  return {
    id: "intent:port-1",
    merchantRef: "merchant:port-1",
    acceptancePolicyId: "policy.base.1",
    cryptoAcceptancePolicyId: "policy.crypto.1",
    amount: usd(10_000n),
    createdAt: T0,
    expiresAt: T60,
  };
}

describe("merchantPaymentIntentStateMachine", () => {
  it("walks the full legal happy path to SUCCEEDED", () => {
    let state = merchantPaymentIntentStateMachine.initial;
    expect(state).toBe("REQUIRES_PAYMENT_METHOD");

    const attach = merchantPaymentIntentStateMachine.transition(
      state,
      "ATTACH_METHOD",
      context,
    );
    expect(attach).toEqual({
      from: "REQUIRES_PAYMENT_METHOD",
      on: "ATTACH_METHOD",
      to: "REQUIRES_CONFIRMATION",
    });
    state = attach.to;

    const confirm = merchantPaymentIntentStateMachine.transition(state, "CONFIRM", context);
    expect(confirm.to).toBe("PROCESSING");
    state = confirm.to;

    const succeeded = merchantPaymentIntentStateMachine.transition(
      state,
      "CONFIRM_SUCCEEDED",
      context,
    );
    expect(succeeded.to).toBe("SUCCEEDED");
    expect(merchantPaymentIntentStateMachine.isTerminal(succeeded.to)).toBe(true);
  });

  it("guards EXPIRE to now >= expiresAt from REQUIRES_PAYMENT_METHOD (fails before, passes at the boundary)", () => {
    expect(() =>
      merchantPaymentIntentStateMachine.transition("REQUIRES_PAYMENT_METHOD", "EXPIRE", {
        now: T60 - 1n,
        expiresAt: T60,
      }),
    ).toThrow(MachineGuardError);
    expect(
      merchantPaymentIntentStateMachine.canTransition("REQUIRES_PAYMENT_METHOD", "EXPIRE", {
        now: T60 - 1n,
        expiresAt: T60,
      }),
    ).toBe(false);
    const expired = merchantPaymentIntentStateMachine.transition(
      "REQUIRES_PAYMENT_METHOD",
      "EXPIRE",
      { now: T60, expiresAt: T60 },
    );
    expect(expired.to).toBe("EXPIRED");
  });

  it("guards EXPIRE to now >= expiresAt from REQUIRES_CONFIRMATION (fails before, passes after)", () => {
    expect(() =>
      merchantPaymentIntentStateMachine.transition("REQUIRES_CONFIRMATION", "EXPIRE", {
        now: T60 - 1n,
        expiresAt: T60,
      }),
    ).toThrow(MachineGuardError);
    const expired = merchantPaymentIntentStateMachine.transition(
      "REQUIRES_CONFIRMATION",
      "EXPIRE",
      { now: T60 + 1n, expiresAt: T60 },
    );
    expect(expired.to).toBe("EXPIRED");
  });

  it("allows CANCEL from all three non-terminal pre-states", () => {
    for (const from of [
      "REQUIRES_PAYMENT_METHOD",
      "REQUIRES_CONFIRMATION",
      "PROCESSING",
    ] as const) {
      const cancelled = merchantPaymentIntentStateMachine.transition(from, "CANCEL", context);
      expect(cancelled.to).toBe("CANCELED");
      expect(cancelled.from).toBe(from);
    }
  });

  it("reaches OUTCOME_UNKNOWN from PROCESSING and exits ONLY via RESOLVE_*", () => {
    const unknown = merchantPaymentIntentStateMachine.transition(
      "PROCESSING",
      "REPORT_UNKNOWN",
      context,
    );
    expect(unknown.to).toBe("OUTCOME_UNKNOWN");
    expect(merchantPaymentIntentStateMachine.isTerminal("OUTCOME_UNKNOWN")).toBe(false);

    const resolvedSucceeded = merchantPaymentIntentStateMachine.transition(
      "OUTCOME_UNKNOWN",
      "RESOLVE_SUCCEEDED",
      context,
    );
    expect(resolvedSucceeded.to).toBe("SUCCEEDED");

    const resolvedFailed = merchantPaymentIntentStateMachine.transition(
      "OUTCOME_UNKNOWN",
      "RESOLVE_FAILED",
      context,
    );
    expect(resolvedFailed.to).toBe("FAILED");

    for (const event of merchantPaymentIntentStateMachine.events) {
      if (event === "RESOLVE_SUCCEEDED" || event === "RESOLVE_FAILED") {
        continue;
      }
      expect(() =>
        merchantPaymentIntentStateMachine.transition("OUTCOME_UNKNOWN", event, context),
      ).toThrow(MachineTransitionError);
    }
  });

  it("terminal states are monotonic: every event from every terminal throws", () => {
    for (const terminal of merchantPaymentIntentStateMachine.terminalStates) {
      for (const event of merchantPaymentIntentStateMachine.events) {
        expect(() =>
          merchantPaymentIntentStateMachine.transition(terminal, event, context),
        ).toThrow(MachineTransitionError);
      }
    }
    expect(() =>
      merchantPaymentIntentStateMachine.transition("SUCCEEDED", "CONFIRM", context),
    ).toThrow(/terminal/);
  });

  it("PROCESSING has no EXPIRE transition — an in-flight payment must resolve, never expire", () => {
    const late = { now: T60 + 3_600_000n, expiresAt: T60 };
    expect(() =>
      merchantPaymentIntentStateMachine.transition("PROCESSING", "EXPIRE", late),
    ).toThrow(MachineTransitionError);
    expect(
      merchantPaymentIntentStateMachine.canTransition("PROCESSING", "EXPIRE", late),
    ).toBe(false);
  });
});

describe("defineMerchantPaymentIntent", () => {
  it("builds a frozen intent in the REQUIRES_PAYMENT_METHOD initial state on the happy path", () => {
    const intent = defineMerchantPaymentIntent(baseIntentInput());
    expect(intent.id).toBe("intent:port-1");
    expect(intent.merchantRef).toBe("merchant:port-1");
    expect(intent.acceptancePolicyId).toBe("policy.base.1");
    expect(intent.cryptoAcceptancePolicyId).toBe("policy.crypto.1");
    expect(intent.amount.value).toBe(10_000n);
    expect(intent.amount.currency).toBe("USD");
    expect(intent.state).toBe("REQUIRES_PAYMENT_METHOD");
    expect(intent.createdAt).toBe(T0);
    expect(intent.expiresAt).toBe(T60);
    expect(intent.customerRef).toBeUndefined();
    expect(Object.isFrozen(intent)).toBe(true);

    // The journey fixtures build the same way (real-constructor fixtures).
    const fromFixtures = intentFixture();
    expect(fromFixtures.state).toBe("REQUIRES_PAYMENT_METHOD");
    expect(Object.isFrozen(fromFixtures)).toBe(true);
    expect(fromFixtures.amount).toEqual(usd(10_000n));
  });

  it("conditionally carries customerRef", () => {
    const intent = defineMerchantPaymentIntent({
      ...baseIntentInput(),
      customerRef: "customer:port-7",
    });
    expect(intent.customerRef).toBe("customer:port-7");
    expect("customerRef" in intent).toBe(true);
    expect(() =>
      defineMerchantPaymentIntent({ ...baseIntentInput(), customerRef: "" }),
    ).toThrow(ValidationError);
  });

  it("rejects expiresAt at or before createdAt (expiry strictly after creation)", () => {
    expect(() =>
      defineMerchantPaymentIntent({ ...baseIntentInput(), expiresAt: T0 }),
    ).toThrow(ValidationError);
    expect(() =>
      defineMerchantPaymentIntent({ ...baseIntentInput(), expiresAt: T0 - 1n }),
    ).toThrow(ValidationError);
  });

  it("rejects a non-positive amount", () => {
    expect(() =>
      defineMerchantPaymentIntent({ ...baseIntentInput(), amount: usd(0n) }),
    ).toThrow(ValidationError);
    expect(() =>
      defineMerchantPaymentIntent({ ...baseIntentInput(), amount: usd(-1n) }),
    ).toThrow(ValidationError);
  });

  it("rejects empty ids and refs", () => {
    // An empty id fails the branded-id law (ADAPTED: the local taxonomy
    // splits branded-id failures from plain validation failures).
    expect(() => defineMerchantPaymentIntent({ ...baseIntentInput(), id: "" })).toThrow(
      InvalidIdentifierError,
    );
    expect(() => defineMerchantPaymentIntent({ ...baseIntentInput(), merchantRef: "" })).toThrow(
      ValidationError,
    );
    expect(() =>
      defineMerchantPaymentIntent({ ...baseIntentInput(), acceptancePolicyId: "" }),
    ).toThrow(ValidationError);
    expect(() =>
      defineMerchantPaymentIntent({ ...baseIntentInput(), cryptoAcceptancePolicyId: "" }),
    ).toThrow(ValidationError);
  });
});
