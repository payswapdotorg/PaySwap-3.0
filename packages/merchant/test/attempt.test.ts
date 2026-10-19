/**
 * @payswap/merchant — the merchant payment attempt suite (P5-W3, lane
 * R3-W3, Task 3-c; PORT of old packages/merchant-crypto
 * test/attempt.test.ts @ 8a735bf — 31 sites -> 19 sites, consolidated:
 * one site per machine law, the evidence-mandatory + happy-path +
 * shape-law variants of the outcome/attach family folded into single
 * sites; the route/translation attachment laws live in the
 * settlement-routes suite of this lane.
 *
 * ADAPTATIONS: local error taxonomy (Machine*Error), PINNED
 * UnknownOutcomeResolution (string resolvedBy), PINNED
 * PaymentMethodTranslation, PINNED branded SettlementInstructionId.
 * Every instant is a fixed bigint (no Date/timers/randomness/process).
 */

import { describe, expect, it } from "vitest";
import {
  abandonMerchantPaymentAttempt,
  asSettlementInstructionId,
  attachSettlement,
  attachSubmission,
  attemptOutcome,
  beginMerchantPaymentAttempt,
  confirmMerchantPaymentAttemptFailed,
  confirmMerchantPaymentAttemptSucceeded,
  defineCryptoQuote,
  materialTermsFromQuote,
  merchantPaymentAttemptStateMachine,
  reportMerchantPaymentAttemptUnknown,
  resolveMerchantPaymentAttemptUnknown,
  submitMerchantPaymentAttempt,
} from "../src/index.ts";
import type {
  CryptoQuote,
  MerchantPaymentAttempt,
  PinnedPaymentMethodTranslation,
} from "../src/index.ts";
import {
  InvalidIdentifierError,
  MachineGuardError,
  MachineTransitionError,
  ValidationError,
} from "../src/errors.ts";
import { ETH, T0, T60, USDC, canonicalQuote, ethAmount, usd, usdcAmount } from "./fixtures.ts";
import { intentFixture, resolveFailedFixture, resolveSucceededFixture } from "./journey-fixtures.ts";

// The pinned deterministic instants of this suite (fixed bigints).
const BEGIN_AT = T60; // begin: one hour after the fixture epoch
const SUBMIT_AT = T60 + 60_000n; // submit: one minute after begin
const OBSERVE_AT = T60 + 120_000n; // definitive/unknown observation
const RESOLVE_AT = T60 + 180_000n; // reconciliation resolution
const ATTACH_AT = T60 + 240_000n; // settlement attachment
/** The canonical quote's validity boundary (T0 + 2h). */
const QUOTE_VALID_UNTIL = T0 + 7_200_000n;

/** Assert both the typed error class and the message law. */
function expectReject(
  fn: () => unknown,
  message: RegExp,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: new (...args: any[]) => Error = ValidationError,
): void {
  expect(fn).toThrow(error);
  expect(fn).toThrow(message);
}

/** A canonical-quote variant (same exact amounts; id/asset/chain vary). */
function quoteVariant(overrides: { id?: string; assetId?: string; chainId?: string }): CryptoQuote {
  const assetId = overrides.assetId ?? USDC.id;
  return defineCryptoQuote({
    id: overrides.id ?? "quote.usdc.1",
    assetId,
    chainId: overrides.chainId ?? "chain.eth-mainnet",
    fiatAmount: usd(10_000n),
    cryptoAmount: assetId === ETH.id ? ethAmount(100_000_000n) : usdcAmount(100_000_000n),
    ratio: { numerator: 1n, denominator: 10_000n },
    fees: usd(30n),
    quotedAt: T0,
    validUntil: QUOTE_VALID_UNTIL,
    sourceRef: "source.psp.fixture",
  });
}

function beginAttempt(): MerchantPaymentAttempt {
  return beginMerchantPaymentAttempt({ id: "attempt:port-1", intent: intentFixture(), quote: canonicalQuote(), now: BEGIN_AT });
}

function submitAttempt(): MerchantPaymentAttempt {
  return submitMerchantPaymentAttempt(beginAttempt(), canonicalQuote(), SUBMIT_AT);
}

/** A SUBMITTED attempt already carrying one linked evidence id. */
function submittedWithEvidence(): MerchantPaymentAttempt {
  return { ...submitAttempt(), evidenceIds: Object.freeze(["evidence:submitted-1"]) };
}

function unknownAttempt(): MerchantPaymentAttempt {
  return reportMerchantPaymentAttemptUnknown(submitAttempt(), { evidenceIds: ["evidence:ambiguity-1"], now: OBSERVE_AT });
}

function confirmedAttempt(): MerchantPaymentAttempt {
  return confirmMerchantPaymentAttemptSucceeded(submitAttempt(), { evidenceIds: ["evidence:confirmed-1"], now: OBSERVE_AT });
}

describe("merchantPaymentAttemptStateMachine", () => {
  it("guards SUBMIT to now < quoteValidUntil — the guard rejects at the boundary", () => {
    const atBoundary = { now: QUOTE_VALID_UNTIL, quoteValidUntil: QUOTE_VALID_UNTIL };
    expect(() => merchantPaymentAttemptStateMachine.transition("PENDING", "SUBMIT", atBoundary)).toThrow(MachineGuardError);
    expect(merchantPaymentAttemptStateMachine.canTransition("PENDING", "SUBMIT", atBoundary)).toBe(false);
    expect(merchantPaymentAttemptStateMachine.transition("PENDING", "SUBMIT", { now: QUOTE_VALID_UNTIL - 1n, quoteValidUntil: QUOTE_VALID_UNTIL }).to).toBe("SUBMITTED");
    // The function-level submit obeys the same guard (the quote is the authority).
    expect(() => submitMerchantPaymentAttempt(beginAttempt(), canonicalQuote(), QUOTE_VALID_UNTIL)).toThrow(MachineGuardError);
  });

  it("declares ABANDON only from PENDING", () => {
    expect(merchantPaymentAttemptStateMachine.transition("PENDING", "ABANDON").to).toBe("ABANDONED");
    expect(() => merchantPaymentAttemptStateMachine.transition("SUBMITTED", "ABANDON")).toThrow(MachineTransitionError);
    expect(merchantPaymentAttemptStateMachine.canTransition("SUBMITTED", "ABANDON")).toBe(false);
  });

  it("declares CONFIRM_SUCCEEDED/CONFIRM_FAILED/REPORT_UNKNOWN only from SUBMITTED", () => {
    for (const event of ["CONFIRM_SUCCEEDED", "CONFIRM_FAILED", "REPORT_UNKNOWN"] as const) {
      expect(() => merchantPaymentAttemptStateMachine.transition("PENDING", event)).toThrow(MachineTransitionError);
      expect(() => merchantPaymentAttemptStateMachine.transition("OUTCOME_UNKNOWN", event)).toThrow(MachineTransitionError);
    }
    expect(merchantPaymentAttemptStateMachine.transition("SUBMITTED", "CONFIRM_SUCCEEDED").to).toBe("CONFIRMED");
    expect(merchantPaymentAttemptStateMachine.transition("SUBMITTED", "CONFIRM_FAILED").to).toBe("FAILED");
    expect(merchantPaymentAttemptStateMachine.transition("SUBMITTED", "REPORT_UNKNOWN").to).toBe("OUTCOME_UNKNOWN");
  });

  it("exits OUTCOME_UNKNOWN ONLY via RESOLVE_* (UNKNOWN is never silently FAILED)", () => {
    expect(merchantPaymentAttemptStateMachine.isTerminal("OUTCOME_UNKNOWN")).toBe(false);
    for (const event of merchantPaymentAttemptStateMachine.events) {
      if (event === "RESOLVE_SUCCEEDED" || event === "RESOLVE_FAILED") {
        continue;
      }
      expect(() => merchantPaymentAttemptStateMachine.transition("OUTCOME_UNKNOWN", event)).toThrow(MachineTransitionError);
    }
    expect(merchantPaymentAttemptStateMachine.transition("OUTCOME_UNKNOWN", "RESOLVE_SUCCEEDED").to).toBe("CONFIRMED");
    expect(merchantPaymentAttemptStateMachine.transition("OUTCOME_UNKNOWN", "RESOLVE_FAILED").to).toBe("FAILED");
    expect(() => merchantPaymentAttemptStateMachine.transition("SUBMITTED", "RESOLVE_SUCCEEDED")).toThrow(MachineTransitionError);
  });

  it("terminal states CONFIRMED/FAILED/ABANDONED are monotonic: every event throws", () => {
    for (const terminal of merchantPaymentAttemptStateMachine.terminalStates) {
      for (const event of merchantPaymentAttemptStateMachine.events) {
        expect(() => merchantPaymentAttemptStateMachine.transition(terminal, event)).toThrow(MachineTransitionError);
      }
    }
    expect(() => merchantPaymentAttemptStateMachine.transition("CONFIRMED", "SUBMIT")).toThrow(/terminal/);
  });
});

describe("beginMerchantPaymentAttempt", () => {
  it("begins a PENDING attempt with an immutable quote snapshot and empty linkage", () => {
    const quote = canonicalQuote();
    const attempt = beginMerchantPaymentAttempt({ id: "attempt:port-1", intent: intentFixture(), quote, now: BEGIN_AT });
    expect(attempt.id).toBe("attempt:port-1");
    expect(attempt.intentId).toBe("intent:fixture-1");
    expect(attempt.assetId).toBe(quote.assetId);
    expect(attempt.chainId).toBe(quote.chainId);
    expect(attempt.quoteId).toBe(quote.id);
    expect(attempt.quotedCryptoAmount).toBe(quote.cryptoAmount);
    expect(attempt.quotedCryptoAmount.value).toBe(100_000_000n);
    expect(attempt.state).toBe("PENDING");
    expect(attempt.settlementAttemptIds).toEqual([]);
    expect(attempt.evidenceIds).toEqual([]);
    expect(attempt.createdAt).toBe(BEGIN_AT);
    expect(attempt.updatedAt).toBe(BEGIN_AT);
    expect(Object.isFrozen(attempt)).toBe(true);
  });

  it("rejects an expired quote — a fresh quote is required", () => {
    const beginAt = (now: bigint) => () =>
      beginMerchantPaymentAttempt({ id: "attempt:port-x", intent: intentFixture(), quote: canonicalQuote(), now });
    expectReject(beginAt(QUOTE_VALID_UNTIL), /quote is expired/, ValidationError);
    expectReject(beginAt(QUOTE_VALID_UNTIL + 1n), /quote is expired/, ValidationError);
  });
});

describe("submitMerchantPaymentAttempt", () => {
  it("enforces the same-quote law: wrong quoteId, asset or chain throws", () => {
    const submitWith = (quote: CryptoQuote) => () => submitMerchantPaymentAttempt(beginAttempt(), quote, SUBMIT_AT);
    expectReject(submitWith(quoteVariant({ id: "quote.usdc.2" })), /exact quote/);
    expectReject(submitWith(quoteVariant({ assetId: ETH.id })), /asset and chain/);
    expectReject(submitWith(quoteVariant({ chainId: "chain.base-mainnet" })), /asset and chain/);
  });

  it("submits while the quote is unexpired, returning a NEW frozen record — the original is untouched", () => {
    const pending = beginAttempt();
    const submitted = submitMerchantPaymentAttempt(pending, canonicalQuote(), SUBMIT_AT);
    expect(submitted.state).toBe("SUBMITTED");
    expect(submitted.updatedAt).toBe(SUBMIT_AT);
    expect(submitted.quoteId).toBe("quote.usdc.1");
    expect(Object.isFrozen(submitted)).toBe(true);
    // Records are never mutated in place:
    expect(submitted).not.toBe(pending);
    expect(pending.state).toBe("PENDING");
    expect(pending.updatedAt).toBe(BEGIN_AT);
  });
});

describe("attachSubmission", () => {
  it("attaches the external tx ref only on a SUBMITTED attempt (never an empty one)", () => {
    const submitted = attachSubmission(submitAttempt(), { externalTxRef: "tx:port-external-1", now: OBSERVE_AT });
    expect(submitted.state).toBe("SUBMITTED");
    expect(submitted.externalTxRef).toBe("tx:port-external-1");
    expect(submitted.updatedAt).toBe(OBSERVE_AT);
    expect(() => attachSubmission(beginAttempt(), { externalTxRef: "tx:port-external-1", now: OBSERVE_AT })).toThrow(ValidationError);
    expect(() => attachSubmission(submitAttempt(), { externalTxRef: "", now: OBSERVE_AT })).toThrow(ValidationError);
  });
});

describe("confirmMerchantPaymentAttemptSucceeded", () => {
  it("evidence is MANDATORY: empty (or blank) evidenceIds throws", () => {
    const confirmWith = (evidenceIds: string[]) => () =>
      confirmMerchantPaymentAttemptSucceeded(submitAttempt(), { evidenceIds, now: OBSERVE_AT });
    expectReject(confirmWith([]), /evidence/, ValidationError);
    expectReject(confirmWith([""]), /evidence/, ValidationError);
  });

  it("confirms success, merging evidence order-preserving with optional externalTxRef/translation", () => {
    const translation: PinnedPaymentMethodTranslation = Object.freeze({
      id: "translation:port-1",
      requestedMethod: "pm:stablecoin-crypto",
      materialTerms: materialTermsFromQuote(canonicalQuote(), {
        completionMs: 3_600_000n,
        recourse: "MERCHANT_DISPUTE_WINDOW",
        settlementDestinationId: "destination.bank.1",
      }),
    });
    const confirmed = confirmMerchantPaymentAttemptSucceeded(submittedWithEvidence(), {
      evidenceIds: ["evidence:confirmed-1"],
      externalTxRef: "tx:port-external-1",
      translation,
      now: OBSERVE_AT,
    });
    expect(confirmed.state).toBe("CONFIRMED");
    expect(confirmed.evidenceIds).toEqual(["evidence:submitted-1", "evidence:confirmed-1"]);
    expect(confirmed.externalTxRef).toBe("tx:port-external-1");
    expect(confirmed.translation).toBe(translation);
    expect(Object.isFrozen(confirmed.evidenceIds)).toBe(true);
    expect(Object.isFrozen(confirmed)).toBe(true);
  });
});

describe("confirmMerchantPaymentAttemptFailed", () => {
  it("evidence is MANDATORY and records definitive failure", () => {
    expectReject(
      () => confirmMerchantPaymentAttemptFailed(submitAttempt(), { evidenceIds: [], now: OBSERVE_AT }),
      /evidence/,
      ValidationError,
    );
    const failed = confirmMerchantPaymentAttemptFailed(submitAttempt(), { evidenceIds: ["evidence:failed-1"], now: OBSERVE_AT });
    expect(failed.state).toBe("FAILED");
    expect(failed.evidenceIds).toEqual(["evidence:failed-1"]);
    expect(attemptOutcome(failed)).toBe("FAILED");
  });
});

describe("reportMerchantPaymentAttemptUnknown", () => {
  it("evidence is MANDATORY (the ambiguity observation is evidence) and UNKNOWN is first-class", () => {
    expectReject(
      () => reportMerchantPaymentAttemptUnknown(submitAttempt(), { evidenceIds: [], now: OBSERVE_AT }),
      /evidence/,
      ValidationError,
    );
    const unknown = reportMerchantPaymentAttemptUnknown(submitAttempt(), { evidenceIds: ["evidence:ambiguity-1"], now: OBSERVE_AT });
    expect(unknown.state).toBe("OUTCOME_UNKNOWN");
    expect(unknown.evidenceIds).toEqual(["evidence:ambiguity-1"]);
    expect(attemptOutcome(unknown)).toBe("OUTCOME_UNKNOWN");
  });
});

describe("resolveMerchantPaymentAttemptUnknown", () => {
  it("resolves CONFIRMED_SUCCEEDED to CONFIRMED, merging the resolution evidence — the caseId is never evidence", () => {
    const resolved = resolveMerchantPaymentAttemptUnknown(unknownAttempt(), resolveSucceededFixture(), RESOLVE_AT);
    expect(resolved.state).toBe("CONFIRMED");
    expect(resolved.evidenceIds).toEqual(["evidence:ambiguity-1", "reconciliation-evidence:1"]);
    expect(resolved.evidenceIds).not.toContain(resolveSucceededFixture().caseId);
    expect(resolved.updatedAt).toBe(RESOLVE_AT);
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it("resolves CONFIRMED_FAILED to FAILED and rejects an evidence-less resolution", () => {
    const resolved = resolveMerchantPaymentAttemptUnknown(unknownAttempt(), resolveFailedFixture(), RESOLVE_AT);
    expect(resolved.state).toBe("FAILED");
    expect(resolved.evidenceIds).toEqual(["evidence:ambiguity-1", "reconciliation-evidence:2"]);
    expectReject(
      () => resolveMerchantPaymentAttemptUnknown(unknownAttempt(), { ...resolveSucceededFixture(), evidenceIds: [] }, RESOLVE_AT),
      /evidence/,
      ValidationError,
    );
  });
});

describe("attachSettlement", () => {
  it("attaches the PINNED SettlementInstructionId on a CONFIRMED attempt (the delegation handle)", () => {
    const pinnedRef = asSettlementInstructionId("settlement-instruction:port-1");
    const settled = attachSettlement(confirmedAttempt(), {
      settlementInstructionId: "settlement-instruction:port-1",
      settlementAttemptIds: ["settlement-attempt:1", "settlement-attempt:2"],
      now: ATTACH_AT,
    });
    expect(settled.state).toBe("CONFIRMED");
    expect(settled.settlementInstructionId).toBe(pinnedRef);
    expect(settled.settlementAttemptIds).toEqual(["settlement-attempt:1", "settlement-attempt:2"]);
    expect(Object.isFrozen(settled.settlementAttemptIds)).toBe(true);
    expect(Object.isFrozen(settled)).toBe(true);
  });

  it("is only legal on a CONFIRMED attempt and rejects bad instruction ids / empty attempt ids", () => {
    const attachWith = (settlementInstructionId: string, settlementAttemptIds: string[]) => () =>
      attachSettlement(confirmedAttempt(), { settlementInstructionId, settlementAttemptIds, now: ATTACH_AT });
    expect(() => attachSettlement(submitAttempt(), {
      settlementInstructionId: "settlement-instruction:port-1",
      settlementAttemptIds: ["settlement-attempt:1"],
      now: ATTACH_AT,
    })).toThrow(ValidationError);
    expectReject(attachWith("settlement-instruction:port-1", []), /non-empty strings/);
    expectReject(attachWith("", ["settlement-attempt:1"]), /SettlementInstructionId/, InvalidIdentifierError);
    expectReject(attachWith(" settlement-instruction:port-1 ", ["settlement-attempt:1"]), /whitespace/, InvalidIdentifierError);
    expectReject(attachWith(`settlement-instruction:${"x".repeat(300)}`, ["settlement-attempt:1"]), /exceeds/, InvalidIdentifierError);
  });
});

describe("attemptOutcome", () => {
  it("maps every state onto the ExternalOutcome definiteness dimension (UNKNOWN stays UNKNOWN)", () => {
    expect(attemptOutcome(confirmedAttempt())).toBe("SUCCEEDED");
    expect(attemptOutcome(confirmMerchantPaymentAttemptFailed(submitAttempt(), { evidenceIds: ["evidence:failed-1"], now: OBSERVE_AT }))).toBe("FAILED");
    expect(attemptOutcome(unknownAttempt())).toBe("OUTCOME_UNKNOWN");
    expect(attemptOutcome(beginAttempt())).toBe("PENDING");
    expect(attemptOutcome(submitAttempt())).toBe("PENDING");
    expect(attemptOutcome(abandonMerchantPaymentAttempt(beginAttempt(), ATTACH_AT))).toBe("PENDING");
  });
});
