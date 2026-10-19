/**
 * @payswap/merchant — the wallet-payment PORT fixtures (P5-W3, lane
 * R3-W3): the handoff-only port stubs (SUBMITTING / REFUSING /
 * AMBIGUOUS), the canonical handoff request, the authorization bundle
 * and the full submitted-handoff walk. Every stub carries EXACTLY one
 * method (the handoff-only law); no secret material anywhere (the
 * addresses are PUBLIC).
 */

import {
  buildCheckoutAuthorization,
  buildWalletPaymentHandoffRequest,
  performWalletPaymentHandoff,
  asSettlementInstructionId,
} from "../src/index.ts";
import type {
  CheckoutAuthorizationBundle,
  PinnedSettlementInstructionId,
  PinnedWalletPaymentExecutionPort,
  PinnedWalletPaymentHandoffRequest,
  PinnedWalletPaymentHandoffReceipt,
} from "../src/index.ts";
import {
  canonicalQuote,
  openFlowFixture,
  T60,
  USDC_ETH_BINDING,
} from "./fixtures.ts";

/** The customer's wallet address (a PUBLIC address — never a secret). */
export const CUSTOMER_ADDRESS = "0x1111111111111111111111111111111111111111";

/** The merchant's destination address (a PUBLIC address — never a secret). */
export const MERCHANT_ADDRESS = "0x2222222222222222222222222222222222222222";

/** The protocol-owned settlement-instruction reference (the delegation handle). */
export const SETTLEMENT_INSTRUCTION_REF = asSettlementInstructionId(
  "settlement-instruction:fixture-1",
);

/**
 * A SUBMITTING wallet-payment port stub: the injected trusted surface
 * records the handoff request and answers SUBMITTED with evidence.
 * The stub carries EXACTLY one method (the handoff-only law).
 */
export function submittingPortFixture(calls: PinnedWalletPaymentHandoffRequest[] = []) {
  const port: PinnedWalletPaymentExecutionPort = {
    handoff(request: PinnedWalletPaymentHandoffRequest): PinnedWalletPaymentHandoffReceipt {
      calls.push(request);
      return Object.freeze({
        handoffId: request.handoffId,
        handoffState: "SUBMITTED",
        externalSubmissionRef: `tx:fixture-${request.handoffId}`,
        evidenceRefs: Object.freeze([`handoff-evidence:${request.handoffId}`]),
      });
    },
  };
  return port;
}

/** A REFUSING port stub: refuses BEFORE any external effect (with evidence). */
export function refusingPortFixture(): PinnedWalletPaymentExecutionPort {
  return {
    handoff(request: PinnedWalletPaymentHandoffRequest): PinnedWalletPaymentHandoffReceipt {
      return Object.freeze({
        handoffId: request.handoffId,
        handoffState: "REFUSED",
        externalSubmissionRef: `refusal:${request.handoffId}`,
        evidenceRefs: Object.freeze([`refusal-evidence:${request.handoffId}`]),
      });
    },
  };
}

/** An AMBIGUOUS port stub: the submission outcome is UNKNOWN (evidence kept). */
export function ambiguousPortFixture(): PinnedWalletPaymentExecutionPort {
  return {
    handoff(request: PinnedWalletPaymentHandoffRequest): PinnedWalletPaymentHandoffReceipt {
      return Object.freeze({
        handoffId: request.handoffId,
        handoffState: "OUTCOME_UNKNOWN",
        reportedOutcome: "OUTCOME_UNKNOWN",
        externalSubmissionRef: `ambiguous:${request.handoffId}`,
        evidenceRefs: Object.freeze([`ambiguity-evidence:${request.handoffId}`]),
      });
    },
  };
}

/** The canonical handoff request over the fixtures. */
export function handoffRequestFixture(
  handoffId = "handoff.fixture.1",
): PinnedWalletPaymentHandoffRequest {
  return buildWalletPaymentHandoffRequest({
    handoffId,
    attemptId: `attempt:${handoffId}`,
    optionId: "crypto:asset.usdc@chain.eth-mainnet",
    quoteId: canonicalQuote().id,
    settlementInstructionId: SETTLEMENT_INSTRUCTION_REF,
    transfer: {
      asset: USDC_ETH_BINDING.assetIdentity,
      amount: canonicalQuote().cryptoAmount.value,
      from: CUSTOMER_ADDRESS,
      to: MERCHANT_ADDRESS,
    },
    chainRef: USDC_ETH_BINDING.chainRef,
    paymentSummaryDigest: "digest:payment-summary:fixture",
    writeDigest: "digest:write:fixture",
    expiresAt: canonicalQuote().validUntil,
  });
}

// ---------------------------------------------------------------------------
// Authorization bundle + lineage (over the real builders)
// ---------------------------------------------------------------------------

/** The customer-facing authorization bundle over the canonical flow. */
export function authorizationBundleFixture(): CheckoutAuthorizationBundle {
  const flow = openFlowFixture();
  return buildCheckoutAuthorization({
    flow,
    optionId: "crypto:asset.usdc@chain.eth-mainnet",
    customerWalletAddress: CUSTOMER_ADDRESS,
    destinationAddress: MERCHANT_ADDRESS,
    requestId: "authreq:fixture-1",
    requestedBy: "surface:checkout-web",
    merchantName: "Fixture Coffee Roasters",
    now: T60,
  });
}
// The full handoff walk (bundle → request → receipt) over the real port
// ---------------------------------------------------------------------------

/** Perform the canonical SUBMITTED handoff through a recording port. */
export function performSubmittedHandoffFixture(handoffId = "handoff.fixture.1") {
  const calls: PinnedWalletPaymentHandoffRequest[] = [];
  const port = submittingPortFixture(calls);
  const request = handoffRequestFixture(handoffId);
  const receipt = performWalletPaymentHandoff(port, request);
  return { port, calls, request, receipt };
}
