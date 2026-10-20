import { describe, expect, it } from "vitest";
import {
  CUSTOMER_FACING_STATE_KINDS,
  REQUIRED_TONES,
  runStateHonestyGate,
  stateHonestyViolations,
} from "../src/index.ts";
import type { ConsequentialStateDeclaration } from "../src/index.ts";

/**
 * Hard law 3 — truthful customer-facing states: every consequential
 * surface state is one of {known-success (evidence-backed),
 * known-failure (reasoned), UNKNOWN-with-reason-and-reconciliation};
 * no synthetic success, no hidden mock path, no UNKNOWN styled as
 * failure (the pinned ui tone law).
 */
function honestStateFixture(): ConsequentialStateDeclaration[] {
  return [
    {
      stateId: "payment.settled",
      label: "Payment settled",
      kind: "known-success",
      evidenceRefs: ["evidence:settlement-1"],
      renderTone: "ok",
      dataPath: "live",
    },
    {
      stateId: "payment.declined",
      label: "Payment declined",
      kind: "known-failure",
      failureReason: "The issuer declined the transaction",
      recourseRef: "recourse:dispute-1",
      renderTone: "failed",
      dataPath: "live",
    },
    {
      stateId: "payment.unknown",
      label: "Outcome not yet known",
      kind: "unknown",
      unknownReason: "The provider has not returned a terminal state",
      reconciliationRef: "reconciliation:case-1",
      renderTone: "unknown",
      dataPath: "live",
    },
  ];
}

describe("hard law 3: truthful customer-facing states", () => {
  it("the closed vocabulary is exactly the three truthful kinds", () => {
    expect([...CUSTOMER_FACING_STATE_KINDS]).toEqual([
      "known-success",
      "known-failure",
      "unknown",
    ]);
    expect(Object.isFrozen(CUSTOMER_FACING_STATE_KINDS)).toBe(true);
  });

  it("the pinned tone law: success renders ok; failure renders blocked/failed; UNKNOWN renders unknown", () => {
    expect([...REQUIRED_TONES["known-success"]]).toEqual(["ok"]);
    expect([...REQUIRED_TONES["known-failure"]]).toEqual(["blocked", "failed"]);
    expect([...REQUIRED_TONES.unknown]).toEqual(["unknown"]);
  });

  it("an honest registry passes the gate clean (all three kinds)", () => {
    const result = runStateHonestyGate(honestStateFixture());
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.law).toBe("truthful-states");
    expect(result.severity).toBe("cannot_downgrade_block");
    expect(result.checked).toBe(3);
    expect(result.digest).toMatch(/^ccert:[0-9a-f]{16}$/);
  });

  it("a success without evidence is SYNTHETIC success — a violation", () => {
    const [violation] = stateHonestyViolations({
      stateId: "payment.fake-settled",
      label: "Payment settled",
      kind: "known-success",
      renderTone: "ok",
      dataPath: "live",
    });
    expect(violation?.code).toBe("synthetic_success");
    expect(violation?.law).toBe("truthful-states");
  });

  it("a hidden mock path feeding a consequential state is a violation (even an otherwise-honest one)", () => {
    const violations = stateHonestyViolations({
      stateId: "payment.mock-settled",
      label: "Payment settled",
      kind: "known-success",
      evidenceRefs: ["evidence:mock-1"],
      renderTone: "ok",
      dataPath: "mock",
    });
    expect(violations.map((violation) => violation.code)).toEqual([
      "hidden_mock_path",
    ]);
  });

  it("UNKNOWN without reason or reconciliation pointer is a violation; failure without reason or recourse is a violation", () => {
    expect(
      stateHonestyViolations({
        stateId: "payment.bare-unknown",
        label: "Unknown",
        kind: "unknown",
        renderTone: "unknown",
        dataPath: "live",
      }).map((violation) => violation.code),
    ).toEqual(["unknown_without_reason", "unknown_without_reconciliation"]);
    expect(
      stateHonestyViolations({
        stateId: "payment.bare-failure",
        label: "Failed",
        kind: "known-failure",
        renderTone: "failed",
        dataPath: "live",
      }).map((violation) => violation.code),
    ).toEqual(["failure_without_reason", "failure_without_recourse"]);
  });

  it("UNKNOWN styled as failure (or success) violates the tone law — UNKNOWN is never failure", () => {
    const violations = stateHonestyViolations({
      stateId: "payment.unknown-styled",
      label: "Unknown",
      kind: "unknown",
      unknownReason: "provider silent",
      reconciliationRef: "reconciliation:case-2",
      renderTone: "failed",
      dataPath: "live",
    });
    expect(violations.map((violation) => violation.code)).toEqual([
      "tone_law_violation",
    ]);
  });

  it("the gate is deterministic: identical inputs produce identical digests (byte-identical)", () => {
    const first = runStateHonestyGate(honestStateFixture());
    const second = runStateHonestyGate(honestStateFixture());
    expect(first.digest).toBe(second.digest);
    const leaky = runStateHonestyGate([
      ...honestStateFixture(),
      {
        stateId: "payment.synthetic",
        label: "Settled",
        kind: "known-success",
        renderTone: "ok",
        dataPath: "live",
      },
    ]);
    expect(leaky.passed).toBe(false);
    expect(runStateHonestyGate([
      ...honestStateFixture(),
      {
        stateId: "payment.synthetic",
        label: "Settled",
        kind: "known-success",
        renderTone: "ok",
        dataPath: "live",
      },
    ]).digest).toBe(leaky.digest);
  });
});
