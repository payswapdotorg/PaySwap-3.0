/**
 * PaySwap Desktop (P21-D reviewer-gate, Gap C) — the PURE decision table
 * for projectAttemptVerification (payments/attempt-verification.ts): every
 * branch of the typed verification decision, machine-checked against the
 * reviewer's law:
 *
 * - a CONFIRMED attempt carrying a provider reference is VERIFIABLE (the
 *   read-back can run);
 * - an ALREADY-VERIFIED attempt replays its recorded verification fact;
 * - a RECONCILED attempt never verifies (verification is not applicable);
 * - an AMBIGUOUS attempt (UNKNOWN envelope, or a never-answered
 *   write-ahead) REQUIRES the reconciliation path — an ambiguous outcome
 *   must remain UNKNOWN and never verifies;
 * - a refused or definitively-failed attempt is NOT_CONFIRMED (no provider
 *   object to read back; the mission stays open for a fresh
 *   authorization);
 * - a CONFIRMED attempt with no providerReferences[0] has NO_PROVIDER_
 *   REFERENCE (the read-back has nothing to address);
 * - a foreign attemptId is NO_SUCH_ATTEMPT.
 *
 * PURE: no I/O anywhere — the decision is deterministic over the record.
 */
import { describe, expect, it } from "vitest";

import { projectAttemptVerification } from "../../src/host/payswap/payments/attempt-verification.js";
import type {
  PaymentAttemptRecord,
  PaymentMissionRecord,
  PaymentResultEnvelope,
} from "../../src/host/payswap/payments/contracts.js";

const T0 = "2026-10-27T12:00:00Z";
const ATTEMPT_ID = "pmt-attempt:00000000000000000000000000000001";
const INTENT_ID = "pi_FAKE0001";

/** The pinned base attempt (a CONFIRMED create over the fake lane). */
function confirmedAttempt(overrides: Partial<PaymentAttemptRecord> = {}): PaymentAttemptRecord {
  return {
    attemptId: ATTEMPT_ID,
    operation: "CREATE_EXTERNAL_EFFECT",
    idempotencyKey: "pmt-idem-1",
    commandId: "pmt-cmd:1",
    correlationId: "pmt-corr:1",
    connectionRef: "conn:test-lane",
    executionMode: "SANDBOX",
    authorizationArtifactId: "pmt-auth-1",
    startedAt: T0,
    envelope: {
      outcome: "CONFIRMED",
      providerReferences: [INTENT_ID, "succeeded"],
      dispatchedAt: 1_000,
      completedAt: 2_000,
    },
    ...overrides,
  };
}

/** A mission record carrying exactly the given attempts (the decision reads attempts only). */
function missionOf(attempts: readonly PaymentAttemptRecord[]): PaymentMissionRecord {
  return {
    id: "task:PAYMENT_MISSION:00000000000000000000000000000001",
    direction: "PAY",
    goalStatement: "pay the supplier",
    origin: "COMPOSER_TEXT",
    createdAt: T0,
    updatedAt: T0,
    status: "COMPLETED",
    resumeFrom: "ACTIVE",
    events: [],
    fields: {} as PaymentMissionRecord["fields"],
    attempts,
  };
}

describe("projectAttemptVerification — the pure decision table (the reviewer's Gap C law)", () => {
  it("a CONFIRMED attempt carrying providerReferences[0] is VERIFIABLE with the payment intent id", () => {
    const decision = projectAttemptVerification(missionOf([confirmedAttempt()]), ATTEMPT_ID);
    expect(decision).toEqual({
      kind: "VERIFIABLE",
      attempt: confirmedAttempt(),
      paymentIntentId: INTENT_ID,
    });
  });

  it("an ALREADY-VERIFIED attempt replays its recorded verification fact (idempotent)", () => {
    const verification = {
      readBackStatus: "succeeded",
      providerReferences: [INTENT_ID, "succeeded"],
      source: "EXTERNAL_PROVIDER_RETRIEVAL",
      verifiedAt: T0,
    } as const;
    const decision = projectAttemptVerification(
      missionOf([confirmedAttempt({ verification })]),
      ATTEMPT_ID,
    );
    expect(decision).toEqual({ kind: "ALREADY_VERIFIED", verification });
  });

  it("a RECONCILED attempt is ALREADY_RECONCILED — verification is not applicable", () => {
    const decision = projectAttemptVerification(
      missionOf([
        confirmedAttempt({
          envelope: undefined,
          reconciliation: {
            resolvedTo: "CONFIRMED",
            source: "EXTERNAL_PROVIDER_RETRIEVAL",
            evidenceRefs: ["stmt-1"],
            resolvedAt: T0,
          },
        }),
      ]),
      ATTEMPT_ID,
    );
    expect(decision).toEqual({ kind: "ALREADY_RECONCILED" });
  });

  it("an UNKNOWN envelope is RECONCILIATION_REQUIRED — the ambiguous outcome must remain UNKNOWN (the reviewer's law)", () => {
    const unknownEnvelope: PaymentResultEnvelope = {
      outcome: "UNKNOWN",
      providerReferences: [INTENT_ID],
      ambiguityReason: "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
      providerFailure: { retryable: true, ambiguity: "OUTCOME_UNKNOWN" },
      dispatchedAt: 1_000,
      completedAt: 2_000,
    };
    const decision = projectAttemptVerification(
      missionOf([confirmedAttempt({ envelope: unknownEnvelope })]),
      ATTEMPT_ID,
    );
    expect(decision).toEqual({ kind: "RECONCILIATION_REQUIRED" });
  });

  it("a never-answered write-ahead (no envelope, no refusal) is RECONCILIATION_REQUIRED", () => {
    const decision = projectAttemptVerification(
      missionOf([confirmedAttempt({ envelope: undefined })]),
      ATTEMPT_ID,
    );
    expect(decision).toEqual({ kind: "RECONCILIATION_REQUIRED" });
  });

  it("a REFUSED attempt is NOT_CONFIRMED — no provider object exists to read back", () => {
    const decision = projectAttemptVerification(
      missionOf([
        confirmedAttempt({
          envelope: undefined,
          refusal: { kind: "NO_AUTHORITY_WIRED", reason: "no lane" },
        }),
      ]),
      ATTEMPT_ID,
    );
    expect(decision).toEqual({ kind: "NOT_CONFIRMED" });
  });

  it("a definitively FAILED attempt is NOT_CONFIRMED — the mission stays open for a fresh authorization", () => {
    const failedEnvelope: PaymentResultEnvelope = {
      outcome: "FAILED",
      providerReferences: [],
      providerFailure: { providerErrorCode: "card_declined", retryable: false, ambiguity: "NONE" },
      dispatchedAt: 1_000,
      completedAt: 2_000,
    };
    const decision = projectAttemptVerification(
      missionOf([confirmedAttempt({ envelope: failedEnvelope })]),
      ATTEMPT_ID,
    );
    expect(decision).toEqual({ kind: "NOT_CONFIRMED" });
  });

  it("a CONFIRMED attempt with no providerReferences[0] is NO_PROVIDER_REFERENCE", () => {
    const decision = projectAttemptVerification(
      missionOf([
        confirmedAttempt({
          envelope: {
            outcome: "CONFIRMED",
            providerReferences: [],
            dispatchedAt: 1_000,
            completedAt: 2_000,
          },
        }),
      ]),
      ATTEMPT_ID,
    );
    expect(decision).toEqual({ kind: "NO_PROVIDER_REFERENCE" });
  });

  it("a foreign attemptId is NO_SUCH_ATTEMPT", () => {
    const decision = projectAttemptVerification(
      missionOf([confirmedAttempt()]),
      "pmt-attempt:ffffffffffffffffffffffffffffffff",
    );
    expect(decision).toEqual({ kind: "NO_SUCH_ATTEMPT" });
  });

  it("a mission with no attempts at all is NO_SUCH_ATTEMPT (never a guess)", () => {
    expect(projectAttemptVerification(missionOf([]), ATTEMPT_ID)).toEqual({
      kind: "NO_SUCH_ATTEMPT",
    });
  });
});
