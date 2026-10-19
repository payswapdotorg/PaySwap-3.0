/**
 * @payswap/merchant — the payment lifecycle suite (P5-W3, lane R3-W3, Task 3-h;
 * PORT of old packages/merchant-checkout/test/lifecycle.test.ts @ 8a735bf —
 * 15 sites -> 17 sites: the outcome family split per observation kind, the
 * reconciliation chain expanded into attempt-side/intent-side/consistency).
 *
 * ADAPTATIONS: (a) the composite walks the INJECTION PORT — the lineage is
 * minted with walletPaymentAuthorizationLineage over a REAL authorization
 * bundle + the performSubmittedHandoffFixture receipt (the old onchain kernel
 * pipeline is gone; money movement stays delegated); (b) the reconciliation
 * resolution is the PINNED PinnedUnknownOutcomeResolution (string resolvedBy)
 * from journey-fixtures; (c) CHAIN VOCABULARY — submitWalletPaymentAttempt
 * requires authorization.chainRef === quote.chainId, but the default flow
 * fixtures split the two vocabularies (acceptance chain ids "chain.eth-mainnet"
 * vs kernel chain refs "eth:mainnet"), so the composite runs over a
 * KERNEL-VOCABULARY flow (policy + binding + quote all on "eth:mainnet", like
 * the old repo's uniform fixtures where CHAIN_REF served as merchantChainId,
 * chainRef AND quote.chainId at once). Every constructor on the walk is REAL.
 *
 * Deterministic: fixed bigint instants only (no clock/random/timers).
 */

import { describe, expect, it } from "vitest";
import {
  abandonCheckoutAttempt, activateCryptoAcceptance, attachMethodToIntent,
  attemptMayObserveOutcome, attemptStatusView, beginMerchantPaymentAttempt,
  buildCheckoutAuthorization, confirmIntentSubmission, defineCryptoAssetAcceptance,
  defineCryptoQuote, defineMerchantCryptoAcceptancePolicy, defineRailAssetBinding,
  materialTermsFromQuote, observeAttemptOutcome, openCheckoutFlow,
  recordAmbiguityEvidence, resolveAttemptUnknown, resolveIntentUnknown,
  settleIntentOutcome, submitWalletPaymentAttempt, walletPaymentAuthorizationLineage,
} from "../src/index.ts";
import type { CheckoutPaymentAttempt, PinnedPaymentMethodTranslation, WalletAuthorizationLineage } from "../src/index.ts";
import { MachineTransitionError, ValidationError } from "../src/errors.ts";
import { BASE_POLICY, T0, T60, USDC, activeMerchantFixture, usd, usdcAmount } from "./fixtures.ts";
import { CUSTOMER_ADDRESS, MERCHANT_ADDRESS, performSubmittedHandoffFixture } from "./port-fixtures.ts";
import { intentFixture, resolveFailedFixture, resolveSucceededFixture } from "./journey-fixtures.ts";

// The pinned deterministic instants of this suite (fixed bigints).
const FLOW_AT = T60, ATTACH_AT = T60 + 60_000n, CONFIRM_AT = T60 + 120_000n;
const SUBMIT_AT = T60 + 180_000n, OBSERVE_AT = T60 + 240_000n, RESOLVE_AT = T60 + 300_000n;
const AMBIGUITY_AT = T60 + 330_000n;
/** One chain ref on both sides of the rail binding (kernel vocabulary). */
const KERNEL_CHAIN_REF = "eth:mainnet";
const KERNEL_BINDING = defineRailAssetBinding({ merchantAssetId: USDC.id, merchantChainId: KERNEL_CHAIN_REF, chainRef: KERNEL_CHAIN_REF, assetIdentity: Object.freeze({ symbol: "USDC", chain: KERNEL_CHAIN_REF, assetId: "asset.usdc.eth" }) });
const KERNEL_QUOTE = defineCryptoQuote({ id: "quote.usdc.lifecycle", assetId: USDC.id, chainId: KERNEL_CHAIN_REF, fiatAmount: usd(10_000n), cryptoAmount: usdcAmount(100_000_000n), ratio: { numerator: 1n, denominator: 10_000n }, fees: usd(30n), quotedAt: T0, validUntil: T0 + 7_200_000n, sourceRef: "source.psp.fixture" });

/** Assert both the typed error class and the message law (sibling pattern). */
function expectReject(fn: () => unknown, message: RegExp, error: new (...args: never[]) => Error = ValidationError): void {
  expect(fn).toThrow(error);
  expect(fn).toThrow(message);
}

/** The kernel-vocabulary activation walk (all real constructors). */
function kernelFlowFixture() {
  const policy = defineMerchantCryptoAcceptancePolicy(
    { id: "policy.crypto.lifecycle", merchantRef: "merchant.fixture.1", basePolicyId: BASE_POLICY.id,
      assets: [defineCryptoAssetAcceptance({ assetId: USDC.id, chains: [KERNEL_CHAIN_REF], minAmount: usdcAmount(1_000_000n), maxAmount: usdcAmount(1_000_000_000_000n), requiredConfirmations: 3n })],
      quoteValidityMs: 300_000n },
    BASE_POLICY,
  );
  const activation = activateCryptoAcceptance(
    { id: "activation.lifecycle.1", merchant: activeMerchantFixture(),
      policyInput: { id: policy.id, merchantRef: policy.merchantRef, basePolicyId: policy.basePolicyId, assets: policy.assets, quoteValidityMs: policy.quoteValidityMs },
      basePolicy: BASE_POLICY, now: FLOW_AT },
  );
  return openCheckoutFlow({ id: "flow.lifecycle.1", merchantId: "merchant.fixture.1", activation, basePolicy: BASE_POLICY, cart: { amount: usd(10_000n) }, quotes: [KERNEL_QUOTE], railBindings: [KERNEL_BINDING], now: FLOW_AT, expiresAt: FLOW_AT + 3_600_000n });
}

/** The authorization lineage minted from a REAL bundle + the submitted-handoff receipt. */
function authorizationLineageFixture(): WalletAuthorizationLineage {
  return walletPaymentAuthorizationLineage({
    bundle: buildCheckoutAuthorization({ flow: kernelFlowFixture(), optionId: `crypto:${USDC.id}@${KERNEL_CHAIN_REF}`, customerWalletAddress: CUSTOMER_ADDRESS, destinationAddress: MERCHANT_ADDRESS, requestId: "authreq:lifecycle-1", requestedBy: "surface:checkout-web", merchantName: "Fixture Coffee Roasters", now: FLOW_AT }),
    handoffReceipt: performSubmittedHandoffFixture("handoff.lifecycle.1").receipt,
  });
}

/** A PROCESSING intent over the kernel flow (attach + confirm). */
function processingIntentFixture() {
  return confirmIntentSubmission(attachMethodToIntent(kernelFlowFixture().intent, ATTACH_AT), CONFIRM_AT);
}

/** The canonical SUBMITTED composite. */
function submittedRecordFixture(authorization: WalletAuthorizationLineage = authorizationLineageFixture(), attemptId = "attempt:lifecycle-1"): CheckoutPaymentAttempt {
  return submitWalletPaymentAttempt({ attemptId, intent: processingIntentFixture(), quote: KERNEL_QUOTE, authorization, now: SUBMIT_AT });
}

/** A SUBMITTED composite already carrying one linked evidence id. */
function recordWithEvidenceFixture(): CheckoutPaymentAttempt {
  const record = submittedRecordFixture();
  return { ...record, attempt: { ...record.attempt, evidenceIds: Object.freeze(["evidence:submitted-1"]) } };
}

function confirmedRecordFixture(): CheckoutPaymentAttempt {
  return observeAttemptOutcome(recordWithEvidenceFixture(), { kind: "SUCCEEDED", evidenceIds: ["evidence:confirmed-1"] }, OBSERVE_AT);
}
function failedRecordFixture(): CheckoutPaymentAttempt {
  return observeAttemptOutcome(submittedRecordFixture(), { kind: "FAILED", evidenceIds: ["evidence:failed-1"] }, OBSERVE_AT);
}
function unknownRecordFixture(): CheckoutPaymentAttempt {
  return observeAttemptOutcome(submittedRecordFixture(), { kind: "OUTCOME_UNKNOWN", evidenceIds: ["evidence:ambiguity-1"] }, OBSERVE_AT);
}

describe("submitWalletPaymentAttempt — the composite over the injection port", () => {
  it("submits a frozen composite attempt bound to the wallet authorization lineage", () => {
    const lineage = authorizationLineageFixture();
    const record = submittedRecordFixture(lineage);
    expect(record.attempt.state).toBe("SUBMITTED");
    expect(record.attempt.id).toBe("attempt:lifecycle-1");
    expect(record.attempt.intentId).toBe("intent:flow.lifecycle.1");
    expect(record.attempt.quoteId).toBe(KERNEL_QUOTE.id);
    expect(record.attempt.assetId).toBe(USDC.id);
    expect(record.attempt.chainId).toBe(KERNEL_CHAIN_REF);
    expect(record.attempt.quotedCryptoAmount).toBe(KERNEL_QUOTE.cryptoAmount);
    // the external submission ref is attached VERBATIM from the lineage:
    expect(record.attempt.externalTxRef).toBe("tx:fixture-handoff.lifecycle.1");
    expect(record.attempt.externalTxRef).toBe(lineage.externalSubmissionRef);
    // the lineage is bound to the composite record, not copied:
    expect(record.authorization).toBe(lineage);
    expect(record.authorization.authorizationRequestHash).toBe(lineage.authorizationRequestHash);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.attempt)).toBe(true);
  });

  it("requires the WalletAuthorizationLineage — a hand-made lineage missing fields is fail-closed", () => {
    const lineage = authorizationLineageFixture();
    const submitWith = (authorization: unknown) =>
      submitWalletPaymentAttempt({ attemptId: "attempt:lifecycle-lineage-x", intent: processingIntentFixture(), quote: KERNEL_QUOTE, authorization: authorization as WalletAuthorizationLineage, now: SUBMIT_AT });
    for (const bad of [undefined, {}, { ...lineage, authorizationRequestHash: "" }, { ...lineage, writeDigest: "" }, { ...lineage, externalSubmissionRef: "" }, { ...lineage, evidenceRefs: [] }]) {
      expect(() => submitWith(bad)).toThrow(ValidationError);
    }
    // a payment without an explicit authorization lineage is unrepresentable:
    expectReject(() => submitWith({}), /requires a WalletAuthorizationLineage/);
  });

  it("requires the authorized chain to be the chain the quote was accepted on (mismatch throws)", () => {
    const submitOn = (chainRef: string) =>
      submitWalletPaymentAttempt({ attemptId: "attempt:lifecycle-chain-x", intent: processingIntentFixture(), quote: KERNEL_QUOTE, authorization: { ...authorizationLineageFixture(), chainRef }, now: SUBMIT_AT });
    expectReject(() => submitOn("base:mainnet"), /the authorized chain must be the chain the quote was accepted on/);
  });
});

describe("the intent machine walk (attach + confirm)", () => {
  it("attaches the method (REQUIRES_PAYMENT_METHOD → REQUIRES_CONFIRMATION) and confirms the submission (→ PROCESSING)", () => {
    const intent = intentFixture();
    const withMethod = attachMethodToIntent(intent, ATTACH_AT);
    expect(withMethod.state).toBe("REQUIRES_CONFIRMATION");
    expect(Object.isFrozen(withMethod)).toBe(true);
    expect(withMethod).not.toBe(intent);
    expect(intent.state).toBe("REQUIRES_PAYMENT_METHOD"); // history preserved
    const processing = confirmIntentSubmission(withMethod, CONFIRM_AT);
    expect(processing.state).toBe("PROCESSING");
    expect(Object.isFrozen(processing)).toBe(true);
    // the machine declares neither event from a landed later state:
    expectReject(() => attachMethodToIntent(withMethod, OBSERVE_AT), /not declared|cannot transition/, MachineTransitionError);
    expectReject(() => confirmIntentSubmission(processing, OBSERVE_AT), /not declared|cannot transition/, MachineTransitionError);
  });
});

describe("observeAttemptOutcome — evidence-mandatory typed observations", () => {
  it("SUCCEEDED requires evidence, merges order-preserving, and carries optional externalTxRef/translation", () => {
    const record = recordWithEvidenceFixture();
    expectReject(() => observeAttemptOutcome(record, { kind: "SUCCEEDED", evidenceIds: [] }, OBSERVE_AT), /evidence-mandatory law/);
    const translation: PinnedPaymentMethodTranslation = Object.freeze({ id: "translation:lifecycle-1", requestedMethod: "pm:stablecoin-crypto", materialTerms: materialTermsFromQuote(KERNEL_QUOTE, { completionMs: 3_600_000n, recourse: "MERCHANT_DISPUTE_WINDOW", settlementDestinationId: "destination.bank.1" }) });
    const confirmed = observeAttemptOutcome(record, { kind: "SUCCEEDED", evidenceIds: ["evidence:confirmed-1", "evidence:confirmed-2"], externalTxRef: "tx:onchain-confirmed-1", translation }, OBSERVE_AT);
    expect(confirmed.attempt.state).toBe("CONFIRMED");
    // existing linkage first, then the new ids (order-preserving union):
    expect(confirmed.attempt.evidenceIds).toEqual(["evidence:submitted-1", "evidence:confirmed-1", "evidence:confirmed-2"]);
    expect(confirmed.attempt.externalTxRef).toBe("tx:onchain-confirmed-1");
    expect(confirmed.attempt.translation).toBe(translation);
    expect(Object.isFrozen(confirmed)).toBe(true);
    // externalTxRef/translation are OPTIONAL — the submitted ref survives without them:
    const bare = observeAttemptOutcome(record, { kind: "SUCCEEDED", evidenceIds: ["evidence:confirmed-1"] }, OBSERVE_AT);
    expect(bare.attempt.externalTxRef).toBe(record.attempt.externalTxRef);
    // terminal monotonicity: a second observation after a definitive outcome is rejected:
    expectReject(() => observeAttemptOutcome(confirmed, { kind: "FAILED", evidenceIds: ["evidence:x"] }, OBSERVE_AT), /is terminal/, MachineTransitionError);
  });

  it("FAILED requires evidence and records the definitive failure", () => {
    expectReject(() => observeAttemptOutcome(submittedRecordFixture(), { kind: "FAILED", evidenceIds: [] }, OBSERVE_AT), /evidence-mandatory law/);
    const failed = observeAttemptOutcome(submittedRecordFixture(), { kind: "FAILED", evidenceIds: ["evidence:failed-1", "evidence:failed-2"] }, OBSERVE_AT);
    expect(failed.attempt.state).toBe("FAILED");
    expect(failed.attempt.evidenceIds).toEqual(["evidence:failed-1", "evidence:failed-2"]);
    expect(attemptStatusView(failed).outcome).toBe("FAILED");
    expect(Object.isFrozen(failed)).toBe(true);
  });

  it("OUTCOME_UNKNOWN requires evidence (the ambiguity observation itself is evidence) and is preserved verbatim, never converted", () => {
    expectReject(() => observeAttemptOutcome(submittedRecordFixture(), { kind: "OUTCOME_UNKNOWN", evidenceIds: [] }, OBSERVE_AT), /the ambiguity observation itself is evidence/);
    // an untyped observation is rejected fail-closed:
    expectReject(() => observeAttemptOutcome(submittedRecordFixture(), { kind: "EXPLODED" } as never, OBSERVE_AT), /an outcome observation must be typed SUCCEEDED\/FAILED\/OUTCOME_UNKNOWN/);
    const unknown = unknownRecordFixture();
    expect(unknown.attempt.state).toBe("OUTCOME_UNKNOWN"); // never FAILED, never CONFIRMED
    expect(unknown.attempt.evidenceIds).toEqual(["evidence:ambiguity-1"]);
    expect(attemptStatusView(unknown).outcome).toBe("OUTCOME_UNKNOWN"); // projected verbatim
    expect(Object.isFrozen(unknown)).toBe(true);
  });
});

describe("settleIntentOutcome — the intent settles ONLY from the attempt's own state", () => {
  it("settles a CONFIRMED attempt into SUCCEEDED (evidence mandatory)", () => {
    const intent = processingIntentFixture();
    expectReject(() => settleIntentOutcome(intent, confirmedRecordFixture(), { evidenceIds: [], now: OBSERVE_AT }), /requires non-empty evidence ids/);
    const settled = settleIntentOutcome(intent, confirmedRecordFixture(), { evidenceIds: ["evidence:confirmed-1"], now: OBSERVE_AT });
    expect(settled.state).toBe("SUCCEEDED");
    expect(Object.isFrozen(settled)).toBe(true);
  });

  it("settles a FAILED attempt into FAILED", () => {
    const settled = settleIntentOutcome(processingIntentFixture(), failedRecordFixture(), { evidenceIds: ["evidence:failed-1"], now: OBSERVE_AT });
    expect(settled.state).toBe("FAILED");
    expect(Object.isFrozen(settled)).toBe(true);
  });

  it("settles an OUTCOME_UNKNOWN attempt into OUTCOME_UNKNOWN (REPORT_UNKNOWN)", () => {
    const settled = settleIntentOutcome(processingIntentFixture(), unknownRecordFixture(), { evidenceIds: ["evidence:ambiguity-1"], now: OBSERVE_AT });
    expect(settled.state).toBe("OUTCOME_UNKNOWN"); // UNKNOWN stays first-class on the intent too
    expect(Object.isFrozen(settled)).toBe(true);
  });

  it("refuses to settle from a SUBMITTED attempt (the intent is still PROCESSING)", () => {
    expectReject(() => settleIntentOutcome(processingIntentFixture(), submittedRecordFixture(), { evidenceIds: ["evidence:submitted-1"], now: OBSERVE_AT }), /still PROCESSING/);
  });
});

describe("reconciliation — the only ambiguity exit", () => {
  it("resolveAttemptUnknown: success → CONFIRMED, failure → FAILED, resolution evidence merged, caseId never evidence", () => {
    const resolvedSuccess = resolveAttemptUnknown(unknownRecordFixture(), resolveSucceededFixture(), RESOLVE_AT);
    expect(resolvedSuccess.attempt.state).toBe("CONFIRMED");
    expect(resolvedSuccess.attempt.evidenceIds).toEqual(["evidence:ambiguity-1", "reconciliation-evidence:1"]);
    expect(resolvedSuccess.attempt.evidenceIds).not.toContain(resolveSucceededFixture().caseId);
    const resolvedFailure = resolveAttemptUnknown(unknownRecordFixture(), resolveFailedFixture(), RESOLVE_AT);
    expect(resolvedFailure.attempt.state).toBe("FAILED");
    expect(resolvedFailure.attempt.evidenceIds).toEqual(["evidence:ambiguity-1", "reconciliation-evidence:2"]);
    expect(Object.isFrozen(resolvedSuccess)).toBe(true);
    expect(Object.isFrozen(resolvedFailure)).toBe(true);
  });

  it("UNKNOWN exits ONLY through a reconciliation resolution (attempt + intent walk; the resolved intent is frozen)", () => {
    const unknown = unknownRecordFixture();
    const intentUnknown = settleIntentOutcome(processingIntentFixture(), unknown, { evidenceIds: ["evidence:ambiguity-1"], now: OBSERVE_AT });
    expect(intentUnknown.state).toBe("OUTCOME_UNKNOWN");
    const resolved = resolveAttemptUnknown(unknown, resolveSucceededFixture(), RESOLVE_AT);
    expect(resolved.attempt.state).toBe("CONFIRMED");
    const intentResolved = resolveIntentUnknown(intentUnknown, resolved, resolveSucceededFixture(), RESOLVE_AT);
    expect(intentResolved.state).toBe("SUCCEEDED");
    expect(Object.isFrozen(intentResolved)).toBe(true);
  });

  it("resolveIntentUnknown must match the attempt's reconciled outcome (an inconsistent resolution is rejected)", () => {
    const unknown = unknownRecordFixture();
    const intentUnknown = settleIntentOutcome(processingIntentFixture(), unknown, { evidenceIds: ["evidence:ambiguity-1"], now: OBSERVE_AT });
    // the attempt was reconciled as SUCCESS (CONFIRMED) — the intent resolution must not claim the failure outcome:
    const resolvedAsSuccess = resolveAttemptUnknown(unknown, resolveSucceededFixture(), RESOLVE_AT);
    expectReject(() => resolveIntentUnknown(intentUnknown, resolvedAsSuccess, resolveFailedFixture(), RESOLVE_AT), /must match the attempt's reconciled outcome/);
  });
});

describe("recordAmbiguityEvidence — a re-observe, never a blind retry", () => {
  it("appends evidence linkage on an OUTCOME_UNKNOWN attempt WITHOUT a state change; only there; non-empty required", () => {
    const unknown = unknownRecordFixture();
    // empty evidence is rejected — the observation itself is evidence:
    expectReject(() => recordAmbiguityEvidence(unknown, [], AMBIGUITY_AT), /requires non-empty evidence ids/);
    // a non-ambiguous attempt cannot record ambiguity evidence:
    expectReject(() => recordAmbiguityEvidence(submittedRecordFixture(), ["evidence:x"], AMBIGUITY_AT), /OUTCOME_UNKNOWN attempt/);
    expectReject(() => recordAmbiguityEvidence(confirmedRecordFixture(), ["evidence:x"], AMBIGUITY_AT), /OUTCOME_UNKNOWN attempt/);
    // the re-observe appends linkage WITHOUT any state change (no blind retry):
    const reobserved = recordAmbiguityEvidence(unknown, ["evidence:ambiguity-2"], AMBIGUITY_AT);
    expect(reobserved.attempt.state).toBe("OUTCOME_UNKNOWN");
    expect(reobserved.attempt.evidenceIds).toEqual(["evidence:ambiguity-1", "evidence:ambiguity-2"]);
    expect(reobserved.attempt.updatedAt).toBe(AMBIGUITY_AT);
    expect(Object.isFrozen(reobserved)).toBe(true);
    // the earlier record is untouched (history is never rewritten):
    expect(unknown.attempt.evidenceIds).not.toContain("evidence:ambiguity-2");
    expect(unknown.attempt.state).toBe("OUTCOME_UNKNOWN");
  });
});

describe("status projection + abandonment", () => {
  it("attemptStatusView projects state/outcome/evidence/authorizationRequestHash and attemptMayObserveOutcome gates observation", () => {
    const submitted = submittedRecordFixture();
    const view = attemptStatusView(submitted);
    expect(view.attemptId).toBe("attempt:lifecycle-1");
    expect(view.state).toBe("SUBMITTED");
    expect(view.outcome).toBe("PENDING"); // not-yet-definitive states project as PENDING
    expect(view.evidenceIds).toEqual([]);
    expect(view.authorizationRequestHash).toBe(submitted.authorization.authorizationRequestHash);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.evidenceIds)).toBe(true);
    const confirmed = confirmedRecordFixture();
    expect(attemptStatusView(confirmed).outcome).toBe("SUCCEEDED");
    expect(attemptStatusView(confirmed).evidenceIds).toEqual(["evidence:submitted-1", "evidence:confirmed-1"]);
    expect(attemptStatusView(failedRecordFixture()).outcome).toBe("FAILED");
    expect(attemptStatusView(unknownRecordFixture()).outcome).toBe("OUTCOME_UNKNOWN");
    // an outcome observation is only legal while the machine allows one:
    expect(attemptMayObserveOutcome(submitted)).toBe(true);
    expect(attemptMayObserveOutcome(confirmed)).toBe(false);
    expect(attemptMayObserveOutcome(unknownRecordFixture())).toBe(false);
  });

  it("abandonCheckoutAttempt only from PENDING (a submitted attempt cannot be abandoned)", () => {
    const lineage = authorizationLineageFixture();
    // the ONLY public composite constructor submits immediately, so the PENDING
    // composite is hand-composed over REAL records (a real begun attempt + the real lineage):
    const pendingComposite: CheckoutPaymentAttempt = Object.freeze({
      attempt: beginMerchantPaymentAttempt({ id: "attempt:lifecycle-pending", intent: processingIntentFixture(), quote: KERNEL_QUOTE, now: SUBMIT_AT }),
      authorization: lineage,
    });
    const abandoned = abandonCheckoutAttempt(pendingComposite, AMBIGUITY_AT);
    expect(abandoned.attempt.state).toBe("ABANDONED");
    expect(abandoned.attempt.updatedAt).toBe(AMBIGUITY_AT);
    expect(abandoned.authorization).toBe(lineage); // the lineage is carried unchanged
    expect(Object.isFrozen(abandoned)).toBe(true);
    expect(Object.isFrozen(abandoned.attempt)).toBe(true);
    // the machine's law: ABANDON is declared only from PENDING — a SUBMITTED (or later) composite cannot be abandoned:
    expect(() => abandonCheckoutAttempt(submittedRecordFixture(), AMBIGUITY_AT)).toThrow(MachineTransitionError);
    expect(() => abandonCheckoutAttempt(confirmedRecordFixture(), AMBIGUITY_AT)).toThrow(MachineTransitionError);
    expect(() => abandonCheckoutAttempt(unknownRecordFixture(), AMBIGUITY_AT)).toThrow(MachineTransitionError);
  });
});
