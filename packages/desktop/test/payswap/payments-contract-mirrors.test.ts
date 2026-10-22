/**
 * PaySwap Desktop (P13-C) — the payments-plane CONTRACT MIRROR tests.
 *
 * The payments tree pins the shared agent-task vocabulary and the
 * canonical PaymentIntent shape BY VALUE (the desktop host never
 * imports @payswap/* at runtime — the emitting tsconfig cannot consume
 * the contracts' .ts-suffixed source). This test imports the REAL
 * packages from the TEST TIER (where cross-package source imports are
 * lawful — the established pattern) and asserts behavioral fidelity:
 * drift between a pin and its source is a DEFECT, caught here.
 */

import { describe, expect, it } from "vitest";

import {
  AGENT_TASK_EVENT_KINDS,
  AGENT_TASK_ORIGINS,
  AGENT_TASK_RESUME_WINDOW_SECONDS,
  AGENT_TASK_STATUSES,
  SUPPORTED_AGENT_TASK_ORIGINS,
  TERMINAL_AGENT_TASK_STATUSES,
} from "../../../surface/src/agent-tasks.ts";
import { PAYMENT_INTENT_KEYS } from "../../../economic/src/payment-intent.ts";

import {
  PAYMENT_TASK_EVENT_KINDS,
  PAYMENT_TASK_ORIGINS,
  PAYMENT_TASK_STATUSES,
  SUPPORTED_PAYMENT_TASK_ORIGINS,
  TERMINAL_PAYMENT_TASK_STATUSES,
} from "../../src/host/payswap/payments/contracts.js";
import { PAYMENT_MISSION_RESUME_WINDOW_SECONDS } from "../../src/host/payswap/payments/payment-mission-runtime.js";
import { CANONICAL_PAYMENT_INTENT_KEYS } from "../../src/host/payswap/payments/adapters/economic-payment-intent.js";

describe("the agent-task vocabulary pin (surface agent-tasks.ts, TL-frozen)", () => {
  it("origins match exactly (voice declared-unsupported in both)", () => {
    expect([...PAYMENT_TASK_ORIGINS]).toEqual([...AGENT_TASK_ORIGINS]);
    expect([...SUPPORTED_PAYMENT_TASK_ORIGINS]).toEqual([...SUPPORTED_AGENT_TASK_ORIGINS]);
    expect(SUPPORTED_PAYMENT_TASK_ORIGINS).not.toContain("COMPOSER_VOICE");
  });

  it("statuses + terminal set match exactly", () => {
    expect([...PAYMENT_TASK_STATUSES]).toEqual([...AGENT_TASK_STATUSES]);
    expect([...TERMINAL_PAYMENT_TASK_STATUSES]).toEqual([...TERMINAL_AGENT_TASK_STATUSES]);
  });

  it("event kinds match exactly (OUTCOME_UNKNOWN + RECONCILED included)", () => {
    expect([...PAYMENT_TASK_EVENT_KINDS]).toEqual([...AGENT_TASK_EVENT_KINDS]);
    expect(PAYMENT_TASK_EVENT_KINDS).toContain("OUTCOME_UNKNOWN");
    expect(PAYMENT_TASK_EVENT_KINDS).toContain("RECONCILED");
  });

  it("the resume window matches the shared contract (900s)", () => {
    expect(PAYMENT_MISSION_RESUME_WINDOW_SECONDS).toBe(AGENT_TASK_RESUME_WINDOW_SECONDS);
    expect(AGENT_TASK_RESUME_WINDOW_SECONDS).toBe(900);
  });
});

describe("the canonical PaymentIntent pin (@payswap/economic)", () => {
  it("the 11-field canonical key set matches PAYMENT_INTENT_KEYS exactly", () => {
    expect([...CANONICAL_PAYMENT_INTENT_KEYS]).toEqual([...PAYMENT_INTENT_KEYS]);
    expect(PAYMENT_INTENT_KEYS).toHaveLength(11);
  });
});
