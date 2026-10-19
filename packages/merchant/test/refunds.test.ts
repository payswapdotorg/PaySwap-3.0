import { describe, expect, it } from "vitest";
import {
  defineCryptoQuote, initiateRefund, observeAttemptOutcome,
  observeExternalConversionRefundSupport, observeNativeStripeRefundSupport,
  observeRefundOutcome, refundStateMachine, refundStatusView, resolveRefundUnknown,
  submitRefund, submitWalletPaymentAttempt, walletPaymentAuthorizationLineage,
} from "../src/index.ts";
import type {
  CheckoutPaymentAttempt, CryptoQuote, PinnedConnectedInstance,
  RailRefundSupportObservation, RefundEvent, RefundRecord, RefundState,
} from "../src/index.ts";
import {
  InvalidIdentifierError, MachineTransitionError, SecretShapeError, ValidationError,
} from "../src/errors.ts";
import { T60, USDC, USDC_ETH_BINDING, canonicalQuote, eur, usd, usdcAmount } from "./fixtures.ts";
import {
  CATALOGUE_ENTRY, CONNECTED_INSTANCE, PENDING_INSTANCE, intentFixture,
  resolveFailedFixture, resolveSucceededFixture,
} from "./journey-fixtures.ts";
import { CUSTOMER_ADDRESS, authorizationBundleFixture, performSubmittedHandoffFixture } from "./port-fixtures.ts";

/**
 * The merchant REFUNDS suite (P5-W3, lane R3-W3; PORT of old
 * packages/merchant-checkout/test/refunds.test.ts @ 8a735bf — 16 sites →
 * 15 tests): the refund machine mirrors the payment laws; refund support
 * is a TYPED observation scoped to the ACTUAL rail (INV-13); unsupported
 * rails answer with the typed NOT_SUPPORTED outcome (never an exception);
 * the lifecycle is evidence-mandatory over IMMUTABLE originals.
 * Classification: 1→t3, 2→t4, 3+4→t5, 5→t6, 6+10+11→t7, 7→t9, 8→t8,
 * 9→t10, 12→t1+t2, 13→t12+t13, 14→t2+t13+t14, 15→t13, 16→t14; t15 widens
 * old 13's refundStatusView assertion; REVOKED→PENDING ADAPT, secret-scan
 * probe + chain/evidence guards NET-NEW under the new src.
 */

type InitiationInput = Parameters<typeof initiateRefund>[0];
type AttemptJourney = { readonly submitted: CheckoutPaymentAttempt; readonly confirmed: CheckoutPaymentAttempt };

const EXT_CHAIN: readonly string[] = ["cap.convert.usdc-usd", "cap.offramp.bank"];
const CONFIRM_AT = T60 + 60_000n;
const REFUND_AT = T60 + 120_000n;
const SUBMIT_AT = T60 + 180_000n;
const OBSERVE_AT = T60 + 240_000n;

function baseInitiation(overrides: Partial<InitiationInput> = {}): InitiationInput {
  return {
    refundId: "refund:3i.base", attempt: confirmedAttemptJourney().confirmed,
    originalAmount: usd(10_000n), amount: usd(10_000n),
    railSupport: nativeRefundSupportFixture(), destinationRef: CUSTOMER_ADDRESS,
    recourse: "NONE", now: REFUND_AT, ...overrides,
  };
}

describe("the refund machine (mirrors the payment laws)", () => {
  it("declares the full matrix: SUBMITTED only from PENDING, definitive outcomes only from SUBMITTED, RESOLVE_* only from OUTCOME_UNKNOWN", () => {
    expect([...refundStateMachine.states]).toEqual(["PENDING", "SUBMITTED", "CONFIRMED", "FAILED", "OUTCOME_UNKNOWN"]);
    expect([...refundStateMachine.terminalStates]).toEqual(["CONFIRMED", "FAILED"]);
    const declared: readonly (readonly [RefundState, RefundEvent, RefundState])[] = [
      ["PENDING", "SUBMIT", "SUBMITTED"], ["SUBMITTED", "CONFIRM_SUCCEEDED", "CONFIRMED"],
      ["SUBMITTED", "CONFIRM_FAILED", "FAILED"], ["SUBMITTED", "REPORT_UNKNOWN", "OUTCOME_UNKNOWN"],
      ["OUTCOME_UNKNOWN", "RESOLVE_SUCCEEDED", "CONFIRMED"],
      ["OUTCOME_UNKNOWN", "RESOLVE_FAILED", "FAILED"],
    ];
    // The full 5×6 matrix: declared transitions fire; every undeclared one throws.
    for (const from of refundStateMachine.states) {
      for (const on of refundStateMachine.events) {
        const probe = () => refundStateMachine.transition(from, on);
        const rule = declared.find(([f, e]) => f === from && e === on);
        if (rule === undefined) expect(probe).toThrow(MachineTransitionError);
        else expect(probe().to).toBe(rule[2]);
      }
    }
  });

  it("keeps OUTCOME_UNKNOWN first-class and NON-terminal; CONFIRMED/FAILED are terminal and monotonic", () => {
    expect(refundStateMachine.isTerminal("OUTCOME_UNKNOWN")).toBe(false);
    // No confirmation or submission event is declared from OUTCOME_UNKNOWN:
    for (const on of ["SUBMIT", "CONFIRM_SUCCEEDED", "CONFIRM_FAILED", "REPORT_UNKNOWN"] as const) {
      expect(refundStateMachine.canTransition("OUTCOME_UNKNOWN", on)).toBe(false);
    }
    // The reconciliation resolutions are the only exits, both directions:
    expect(refundStateMachine.canTransition("OUTCOME_UNKNOWN", "RESOLVE_SUCCEEDED")).toBe(true);
    expect(refundStateMachine.canTransition("OUTCOME_UNKNOWN", "RESOLVE_FAILED")).toBe(true);
    // The terminals are monotonic: no event ever rewrites a CONFIRMED/FAILED refund.
    for (const state of ["CONFIRMED", "FAILED"] as const) {
      expect(refundStateMachine.isTerminal(state)).toBe(true);
      for (const on of refundStateMachine.events) {
        expect(() => refundStateMachine.transition(state, on)).toThrow(/terminal/);
      }
    }
  });
});

describe("refund rail observations — scoped to the ACTUAL rail (rule 18)", () => {
  it("observes native Stripe refund support bound to the ACTIVE connected instance (research-pinned semantics)", () => {
    const observation = nativeRefundSupportFixture();
    expect(observation.routeFamily).toBe("NATIVE_STRIPE_CRYPTO");
    expect(observation.supportsRefunds).toBe(true); expect(observation.partialRefunds).toBe(true);
    // Stablecoins back to the customer's original wallet — never fiat; no
    // chargeback/dispute path exists to inherit (the research law):
    expect(observation.refundMedium).toBe("STABLECOIN_TO_ORIGINAL_WALLET");
    expect(observation.chargebackPathAvailable).toBe(false);
    expect(observation.observedAt).toBe(T60);
    // Evidence carried as a fresh frozen copy; the observation itself is frozen:
    expect(observation.evidenceRefs).toEqual(["evidence:rail-observation-refunds-1"]);
    expect(Object.isFrozen(observation)).toBe(true); expect(Object.isFrozen(observation.evidenceRefs)).toBe(true);
  });

  it("a NOT-ACTIVE instance is an honest NOT_SUPPORTED observation — never an error, never a refundMedium", () => {
    const observation = observeNativeStripeRefundSupport({
      observationId: "rail-obs:refunds-pending", connectedInstance: PENDING_INSTANCE,
      evidenceRefs: ["evidence:rail-observation-refunds-2"], observedAt: T60 });
    expect(observation.supportsRefunds).toBe(false); expect(observation.partialRefunds).toBe(false);
    expect(observation.refundMedium).toBeUndefined(); expect(observation.chargebackPathAvailable).toBe(false);
    // The honest observation flows into the typed NOT_SUPPORTED initiation outcome:
    const initiation = initiateRefund(baseInitiation({ refundId: "refund:3i.pending", railSupport: observation }));
    expect(initiation.outcome).toBe("NOT_SUPPORTED");
  });

  it("grounds an observation only on a connected instance, evidence-mandatorily, and secret-scanned", () => {
    // INV-13: a provider catalogue entry can never ground a refund observation:
    const catalogue = () => observeNativeStripeRefundSupport({
      observationId: "rail-obs:refunds-cat",
      connectedInstance: CATALOGUE_ENTRY as unknown as PinnedConnectedInstance,
      evidenceRefs: ["evidence:rail-observation-cat"], observedAt: T60 });
    expect(catalogue).toThrow(ValidationError); expect(catalogue).toThrow(/catalogue/);
    // The observation itself is evidence — an evidence-less observation is rejected:
    const bare = () => observeNativeStripeRefundSupport({
      observationId: "rail-obs:refunds-bare", connectedInstance: CONNECTED_INSTANCE,
      evidenceRefs: [], observedAt: T60 });
    expect(bare).toThrow(ValidationError); expect(bare).toThrow(/evidence/);
    // Secret-scanned: a Stripe-key-shaped observation id (assembled at runtime
    // from fragments — never a literal) makes the observation unconstructible:
    const keyShapedObservationId = ["sk", "_live_", "a1b2c3d4e5f6a7b8c9"].join("");
    expect(() => observeNativeStripeRefundSupport({
      observationId: keyShapedObservationId, connectedInstance: CONNECTED_INSTANCE,
      evidenceRefs: ["evidence:rail-observation-secret-probe"], observedAt: T60,
    })).toThrow(SecretShapeError);
  });

  it("external-conversion refund support is declared, evidence-backed, chain-scoped and typed", () => {
    const supported = observeExternalConversionRefundSupport({
      observationId: "rail-obs:refunds-ext-1", conversionChain: EXT_CHAIN,
      supportsRefunds: true, partialRefunds: true,
      evidenceRefs: ["evidence:rail-observation-refunds-ext-1"], observedAt: T60 });
    expect(supported.routeFamily).toBe("EXTERNAL_PAYSWAP_CONVERSION");
    // supportsRefunds/partialRefunds are the rail's own declaration, passed through:
    expect(supported.supportsRefunds).toBe(true); expect(supported.partialRefunds).toBe(true);
    expect(supported.refundMedium).toBe("EXTERNAL_CONVERSION_RETURN");
    expect(supported.chargebackPathAvailable).toBe(false); expect(Object.isFrozen(supported)).toBe(true);
    const unsupported = observeExternalConversionRefundSupport({
      observationId: "rail-obs:refunds-ext-2", conversionChain: EXT_CHAIN,
      supportsRefunds: false, partialRefunds: false,
      evidenceRefs: ["evidence:rail-observation-refunds-ext-2"], observedAt: T60 });
    expect(unsupported.supportsRefunds).toBe(false); expect(unsupported.refundMedium).toBeUndefined();
    // The observation must reference its reachable conversion chain + evidence:
    const noChain = () => observeExternalConversionRefundSupport({
      observationId: "rail-obs:refunds-ext-x", conversionChain: [], supportsRefunds: false,
      partialRefunds: false, evidenceRefs: ["evidence:x"], observedAt: T60 });
    expect(noChain).toThrow(ValidationError);
    expect(noChain).toThrow(/conversion chain/);
    const noEvidence = () => observeExternalConversionRefundSupport({
      observationId: "rail-obs:refunds-ext-y", conversionChain: EXT_CHAIN,
      supportsRefunds: false, partialRefunds: false, evidenceRefs: [], observedAt: T60 });
    expect(noEvidence).toThrow(ValidationError);
    expect(noEvidence).toThrow(/evidence/);
  });
});

describe("refund initiation — only where the rail supports it", () => {
  it("starts a refund on a CONFIRMED attempt: PENDING record, originals referenced by id, evidence seeded from the rail observation", () => {
    const { confirmed } = confirmedAttemptJourney();
    const railSupport = nativeRefundSupportFixture();
    const initiation = initiateRefund({
      refundId: "refund:3i.1", attempt: confirmed, originalAmount: usd(10_000n),
      amount: usd(4_950n), // a partial refund — the native rail supports them
      railSupport, destinationRef: CUSTOMER_ADDRESS,
      recourse: "MERCHANT_DISPUTE_WINDOW", now: REFUND_AT });
    expect(initiation.outcome).toBe("REFUND_STARTED");
    if (initiation.outcome !== "REFUND_STARTED") throw new Error("the supporting rail must start the refund");
    const refund = initiation.refund;
    expect(refund.state).toBe("PENDING");
    expect(refund.refundMedium).toBe("STABLECOIN_TO_ORIGINAL_WALLET"); expect(refund.routeFamily).toBe("NATIVE_STRIPE_CRYPTO");
    expect(refund.recourse).toBe("MERCHANT_DISPUTE_WINDOW"); expect(refund.destinationRef).toBe(CUSTOMER_ADDRESS);
    // The refund references the original attempt BY ID (originals are immutable):
    expect(refund.originalAttemptId).toBe(confirmed.attempt.id);
    expect(refund.intentId).toBe(confirmed.attempt.intentId);
    // Evidence seeds with the rail observation:
    expect(refund.railObservationId).toBe(railSupport.observationId);
    expect(refund.evidenceIds[0]).toBe(`rail-observation:${railSupport.observationId}`);
    expect(refund.evidenceIds).toContain("evidence:rail-observation-refunds-1");
    expect(Object.isFrozen(refund)).toBe(true);
    // The original attempt is never mutated by the refund:
    expect(confirmed.attempt.state).toBe("CONFIRMED"); expect(Object.isFrozen(confirmed.attempt)).toBe(true);
    // The refund id runs the shared branded-id law first (old asRefundId site):
    expect(() => initiateRefund(baseInitiation({ refundId: " " }))).toThrow(InvalidIdentifierError);
  });

  it("refuses to refund a non-CONFIRMED attempt (fail-closed)", () => {
    const { submitted } = confirmedAttemptJourney();
    const refused = () => initiateRefund(baseInitiation({ attempt: submitted }));
    expect(refused).toThrow(ValidationError);
    expect(refused).toThrow(/CONFIRMED/);
    expect(submitted.attempt.state).toBe("SUBMITTED");
  });

  it("answers a non-supporting rail with the TYPED NOT_SUPPORTED outcome — never an exception", () => {
    const nonSupporting = observeExternalConversionRefundSupport({
      observationId: "rail-obs:refunds-ext-2", conversionChain: EXT_CHAIN,
      supportsRefunds: false, partialRefunds: false,
      evidenceRefs: ["evidence:rail-observation-refunds-ext-2"], observedAt: T60 });
    const initiation = initiateRefund(baseInitiation({ refundId: "refund:3i.ns", railSupport: nonSupporting }));
    expect(initiation.outcome).toBe("NOT_SUPPORTED");
    if (initiation.outcome === "NOT_SUPPORTED") {
      expect(initiation.routeFamily).toBe("EXTERNAL_PAYSWAP_CONVERSION");
      expect(initiation.reason).toContain("does not support refunds");
      // Never an implied future support:
      expect(initiation.reason).not.toContain("soon"); expect(initiation.reason).not.toContain("later");
    }
  });

  it("enforces the exact money laws: the original currency, no over-refund, positive exact Money", () => {
    const over = () => initiateRefund(baseInitiation({ refundId: "r.over", amount: usd(10_001n) }));
    expect(over).toThrow(ValidationError); expect(over).toThrow(/exceed/);
    const wrongCurrency = () => initiateRefund(baseInitiation({ refundId: "r.eur", amount: eur(4_950n) }));
    expect(wrongCurrency).toThrow(ValidationError); expect(wrongCurrency).toThrow(/original currency/);
    const nonPositive = () => initiateRefund(baseInitiation({ refundId: "r.zero", amount: usd(0n) }));
    expect(nonPositive).toThrow(ValidationError); expect(nonPositive).toThrow(/positive/);
    const notExact = () => initiateRefund(
      baseInitiation({ refundId: "r.float", amount: { value: 4_950, currency: "USD" } as never }));
    expect(notExact).toThrow(ValidationError); expect(notExact).toThrow(/exact Money/);
    // The exact original amount refunds cleanly (the boundary is inclusive):
    expect(initiateRefund(baseInitiation({ refundId: "r.full" })).outcome).toBe("REFUND_STARTED");
  });

  it("partial refunds require the rail's partialRefunds support; a supporting rail must declare its refundMedium", () => {
    const noPartial = observeExternalConversionRefundSupport({
      observationId: "rail-obs:refunds-ext-nopartial", conversionChain: EXT_CHAIN,
      supportsRefunds: true, partialRefunds: false,
      evidenceRefs: ["evidence:rail-observation-refunds-ext-3"], observedAt: T60 });
    // A FULL refund is fine on a no-partial rail...
    const full = initiateRefund(baseInitiation({ refundId: "r.full-ext", railSupport: noPartial }));
    expect(full.outcome).toBe("REFUND_STARTED");
    // ...a PARTIAL refund is refused:
    const partial = () => initiateRefund(
      baseInitiation({ refundId: "r.partial", amount: usd(4_950n), railSupport: noPartial }));
    expect(partial).toThrow(ValidationError); expect(partial).toThrow(/partial/);
    // A supporting rail observation must declare HOW refunds return value:
    const { refundMedium: _omitted, ...withoutMedium } = nativeRefundSupportFixture();
    const unmediumed = () => initiateRefund(baseInitiation({ refundId: "r.nomedium", railSupport: withoutMedium }));
    expect(unmediumed).toThrow(ValidationError); expect(unmediumed).toThrow(/refundMedium/);
  });
});

describe("refund lifecycle — evidence-mandatory, immutable originals", () => {
  it("submits a PENDING refund (a NEW record): the submissionRef evidence is appended, the original stays PENDING", () => {
    const pending = pendingRefundFixture();
    const submitted = submitRefund(pending, {
      submissionRef: "refund-submission:3i.1", refundedCryptoAmount: usdcAmount(49_500_000n),
      now: SUBMIT_AT });
    expect(submitted.state).toBe("SUBMITTED");
    expect(submitted.refundedCryptoAmount?.assetId).toBe(USDC.id);
    expect(submitted.refundedCryptoAmount?.value).toBe(49_500_000n);
    // The submission itself is evidence:
    expect(submitted.evidenceIds).toContain("submission:refund-submission:3i.1");
    expect(Object.isFrozen(submitted)).toBe(true);
    // A NEW record: the PENDING original is untouched:
    expect(pending.state).toBe("PENDING"); expect(pending.evidenceIds).not.toContain("submission:refund-submission:3i.1");
    // The submission reference is mandatory:
    expect(() => submitRefund(pending, { submissionRef: "", now: SUBMIT_AT + 1_000n })).toThrow(ValidationError);
    // SUBMITTED only from PENDING (the machine's law, at the flow level):
    const again = () => submitRefund(submitted, { submissionRef: "refund-submission:3i.2", now: SUBMIT_AT + 2_000n });
    expect(again).toThrow(MachineTransitionError);
  });

  it("observes a SUBMITTED refund's outcome: all three kinds are evidence-mandatory; UNKNOWN is preserved", () => {
    const submitted = submittedRefundFixture();
    const succeeded = observeRefundOutcome(
      submitted, { kind: "SUCCEEDED", evidenceIds: ["evidence:refund-confirmation-1"] }, OBSERVE_AT);
    expect(succeeded.state).toBe("CONFIRMED");
    const failed = observeRefundOutcome(
      submitted, { kind: "FAILED", evidenceIds: ["evidence:refund-failure-1"] }, OBSERVE_AT);
    expect(failed.state).toBe("FAILED");
    const unknown = observeRefundOutcome(
      submitted, { kind: "OUTCOME_UNKNOWN", evidenceIds: ["evidence:refund-ambiguity-1"] }, OBSERVE_AT);
    expect(unknown.state).toBe("OUTCOME_UNKNOWN");
    // The SUBMITTED original is never rewritten:
    expect(submitted.state).toBe("SUBMITTED");
    // Evidence-mandatory for EVERY observation kind (definitive or ambiguous):
    for (const kind of ["SUCCEEDED", "FAILED", "OUTCOME_UNKNOWN"] as const) {
      const bare = () => observeRefundOutcome(submitted, { kind, evidenceIds: [] }, OBSERVE_AT);
      expect(bare).toThrow(ValidationError); expect(bare).toThrow(/evidence/);
    }
    // Evidence merges with the existing linkage (existing order first):
    expect(succeeded.evidenceIds.slice(-1)).toEqual(["evidence:refund-confirmation-1"]);
    // A definitive observation from OUTCOME_UNKNOWN is not declared:
    expect(() => observeRefundOutcome(
      unknown, { kind: "FAILED", evidenceIds: ["evidence:refund-late-1"] }, OBSERVE_AT),
    ).toThrow(MachineTransitionError);
  });

  it("resolves an OUTCOME_UNKNOWN refund through reconciliation only, in both directions", () => {
    const submitted = submittedRefundFixture();
    const unknown = observeRefundOutcome(
      submitted, { kind: "OUTCOME_UNKNOWN", evidenceIds: ["evidence:refund-ambiguity-1"] }, OBSERVE_AT);
    const resolvedSucceeded = resolveRefundUnknown(unknown, resolveSucceededFixture(), OBSERVE_AT);
    expect(resolvedSucceeded.state).toBe("CONFIRMED"); expect(resolvedSucceeded.evidenceIds).toContain("reconciliation-evidence:1");
    const resolvedFailed = resolveRefundUnknown(unknown, resolveFailedFixture(), OBSERVE_AT);
    expect(resolvedFailed.state).toBe("FAILED"); expect(resolvedFailed.evidenceIds).toContain("reconciliation-evidence:2");
    // The resolution's caseId is never evidence:
    expect(resolvedFailed.evidenceIds).not.toContain("case:fixture-2");
    // A resolution without evidence is rejected:
    const bare = () => resolveRefundUnknown(unknown, {
      resolvedOutcome: "CONFIRMED_FAILED", resolvedBy: "reconciler:fixture",
      caseId: "case:refunds-x", evidenceIds: [] }, OBSERVE_AT);
    expect(bare).toThrow(ValidationError); expect(bare).toThrow(/evidence/);
    // Resolutions are the ONLY ambiguity exit — not declared from PENDING:
    const premature = () => resolveRefundUnknown(pendingRefundFixture(), resolveSucceededFixture(), OBSERVE_AT);
    expect(premature).toThrow(MachineTransitionError);
  });

  it("projects the read-only refund status view (PENDING/SUBMITTED → PENDING; the rest verbatim)", () => {
    const pendingView = refundStatusView(pendingRefundFixture());
    expect(pendingView.state).toBe("PENDING"); expect(pendingView.outcome).toBe("PENDING");
    const submitted = submitRefund(pendingRefundFixture(), {
      submissionRef: "refund-submission:3i.1", now: SUBMIT_AT });
    const submittedView = refundStatusView(submitted);
    expect(submittedView.state).toBe("SUBMITTED"); expect(submittedView.outcome).toBe("PENDING");
    const succeeded = observeRefundOutcome(
      submitted, { kind: "SUCCEEDED", evidenceIds: ["evidence:refund-confirmation-1"] }, OBSERVE_AT);
    const failed = observeRefundOutcome(
      submitted, { kind: "FAILED", evidenceIds: ["evidence:refund-failure-1"] }, OBSERVE_AT);
    const unknown = observeRefundOutcome(
      submitted, { kind: "OUTCOME_UNKNOWN", evidenceIds: ["evidence:refund-ambiguity-1"] }, OBSERVE_AT);
    const succeededView = refundStatusView(succeeded);
    expect(succeededView.state).toBe("CONFIRMED"); expect(succeededView.outcome).toBe("SUCCEEDED");
    expect(refundStatusView(failed).outcome).toBe("FAILED");
    const unknownView = refundStatusView(unknown);
    expect(unknownView.state).toBe("OUTCOME_UNKNOWN"); expect(unknownView.outcome).toBe("OUTCOME_UNKNOWN");
    // The view is a frozen read-only projection carrying the identity + evidence:
    expect(succeededView.refundId).toBe(succeeded.id);
    expect(succeededView.evidenceIds).toEqual(succeeded.evidenceIds);
    expect(succeededView.evidenceIds).not.toBe(succeeded.evidenceIds);
    expect(Object.isFrozen(succeededView)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Local fixtures (kept local to this file per the task mandate)

function nativeRefundSupportFixture(): RailRefundSupportObservation {
  return observeNativeStripeRefundSupport({
    observationId: "rail-obs:refunds-1", connectedInstance: CONNECTED_INSTANCE,
    evidenceRefs: ["evidence:rail-observation-refunds-1"], observedAt: T60 });
}

/**
 * LANE NOTE: `submitWalletPaymentAttempt` requires authorization.chainRef
 * === quote.chainId; the shared fixtures split the kernel chain ref from
 * the merchant ChainId, so this walk re-anchors the canonical quote on the
 * lineage's kernel chain — the same unification the OLD fixtures performed
 * (old USC_RAIL_BINDING used CHAIN_REF for both vocabularies).
 */
function chainAlignedQuote(): CryptoQuote {
  const canonical = canonicalQuote();
  return defineCryptoQuote({
    id: "quote.usdc.1.kernel-chain", assetId: canonical.assetId,
    chainId: USDC_ETH_BINDING.chainRef, fiatAmount: canonical.fiatAmount,
    cryptoAmount: canonical.cryptoAmount, ratio: canonical.ratio,
    fees: canonical.fees, quotedAt: canonical.quotedAt,
    validUntil: canonical.validUntil, sourceRef: canonical.sourceRef });
}

function confirmedAttemptJourney(): AttemptJourney {
  const bundle = authorizationBundleFixture();
  const { receipt } = performSubmittedHandoffFixture("handoff.refunds.1");
  const authorization = walletPaymentAuthorizationLineage({ bundle, handoffReceipt: receipt });
  const submitted = submitWalletPaymentAttempt({
    attemptId: "attempt:refunds.1", intent: intentFixture(),
    quote: chainAlignedQuote(), authorization, now: T60 });
  const confirmed = observeAttemptOutcome(
    submitted, { kind: "SUCCEEDED", evidenceIds: ["evidence:attempt-confirmation-3i-1"] }, CONFIRM_AT);
  return { submitted, confirmed };
}

function pendingRefundFixture(): RefundRecord {
  const initiation = initiateRefund({
    refundId: "refund:3i.1", attempt: confirmedAttemptJourney().confirmed,
    originalAmount: usd(10_000n), amount: usd(4_950n),
    railSupport: nativeRefundSupportFixture(), destinationRef: CUSTOMER_ADDRESS,
    recourse: "MERCHANT_DISPUTE_WINDOW", now: REFUND_AT });
  if (initiation.outcome !== "REFUND_STARTED") throw new Error("fixture requires a supporting rail");
  return initiation.refund;
}

function submittedRefundFixture(): RefundRecord {
  return submitRefund(pendingRefundFixture(), {
    submissionRef: "refund-submission:3i.1", now: SUBMIT_AT });
}
