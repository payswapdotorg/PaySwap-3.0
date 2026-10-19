import { describe, expect, it } from "vitest";
import {
  assertWalletPaymentPort,
  buildWalletPaymentHandoffRequest,
  performWalletPaymentHandoff,
  handoffReceiptObservation,
  walletPaymentAuthorizationLineage,
  buildCheckoutAuthorization,
  asSettlementInstructionId,
} from "../src/index.ts";
import { PortShapeError, ValidationError } from "../src/errors.ts";
import type {
  PinnedWalletPaymentExecutionPort,
  PinnedWalletPaymentHandoffReceipt,
} from "../src/index.ts";
import {
  CUSTOMER_ADDRESS,
  MERCHANT_ADDRESS,
  SETTLEMENT_INSTRUCTION_REF,
  authorizationBundleFixture,
  handoffRequestFixture,
  refusingPortFixture,
  ambiguousPortFixture,
  submittingPortFixture,
} from "./port-fixtures.ts";
import { canonicalQuote, openFlowFixture, USDC_ETH_BINDING } from "./fixtures.ts";
import { assertNoSecretMaterial } from "../src/index.ts";

/**
 * The wallet-payment DELEGATION SEAM suite (PORTED+ADAPTED from the old
 * wallet-payment sites; the old kernel-pipeline walk is replaced by the
 * INJECTION PORT): the handoff-only port law, the typed handoff
 * request, the evidence-bearing receipt and THE NO-SUCCESS-INFERENCE
 * LAW — a SUBMITTED receipt is NEVER success; the intent settles only
 * from the attempt's own state.
 */

describe("the handoff-only port guard", () => {
  it("a port carrying EXACTLY the handoff method passes the guard", () => {
    const port = submittingPortFixture();
    expect(assertWalletPaymentPort(port)).toBe(port);
    expect(assertWalletPaymentPort(refusingPortFixture())).toBeTruthy();
  });

  it("a port with ANY extra function member is rejected with PortShapeError (no parallel engine)", () => {
    const illegal = {
      handoff: () => ({}),
      settle: () => ({}),
    } as unknown as PinnedWalletPaymentExecutionPort;
    expect(() => assertWalletPaymentPort(illegal)).toThrow(PortShapeError);
    expect(() => assertWalletPaymentPort(illegal)).toThrow(/handoff-only law/);
  });

  it("a non-object port is rejected fail-closed (money movement is delegated, never owned here)", () => {
    expect(() => assertWalletPaymentPort(null as unknown as PinnedWalletPaymentExecutionPort)).toThrow(
      PortShapeError,
    );
    expect(() => assertWalletPaymentPort(42 as unknown as PinnedWalletPaymentExecutionPort)).toThrow(
      PortShapeError,
    );
  });
});

describe("the typed handoff request (the delegation handle)", () => {
  it("the canonical request builds frozen with every field validated (incl. the SettlementInstructionId)", () => {
    const request = handoffRequestFixture();
    expect(Object.isFrozen(request)).toBe(true);
    expect(request.settlementInstructionId).toBe(SETTLEMENT_INSTRUCTION_REF);
    expect(request.transfer.from).toBe(CUSTOMER_ADDRESS);
    expect(request.transfer.to).toBe(MERCHANT_ADDRESS);
    expect(request.transfer.amount).toBe(canonicalQuote().cryptoAmount.value);
    expect(request.chainRef).toBe(USDC_ETH_BINDING.chainRef);
    expect(() => assertNoSecretMaterial(request, "request")).not.toThrow();
  });

  it("a JS-number transfer amount is rejected (INV-2: exact bigint minor units only)", () => {
    expect(() =>
      buildWalletPaymentHandoffRequest({
        ...handoffRequestFixtureInput(),
        transfer: {
          ...handoffRequestFixtureInput().transfer,
          amount: 100000000 as unknown as bigint,
        },
      }),
    ).toThrow(/JS number/);
  });

  it("non-positive transfer amounts are rejected (the exact amount is mandatory)", () => {
    expect(() =>
      buildWalletPaymentHandoffRequest({
        ...handoffRequestFixtureInput(),
        transfer: { ...handoffRequestFixtureInput().transfer, amount: 0n },
      }),
    ).toThrow(/positive bigint/);
    expect(() =>
      buildWalletPaymentHandoffRequest({
        ...handoffRequestFixtureInput(),
        transfer: { ...handoffRequestFixtureInput().transfer, amount: -1n },
      }),
    ).toThrow(/positive bigint/);
  });

  it("a malformed chain reference or an off-chain asset is rejected (the kernel shape laws)", () => {
    expect(() =>
      buildWalletPaymentHandoffRequest({
        ...handoffRequestFixtureInput(),
        chainRef: "not-a-chain-ref",
      }),
    ).toThrow(/kernel chain shape/);
    expect(() =>
      buildWalletPaymentHandoffRequest({
        ...handoffRequestFixtureInput(),
        transfer: {
          ...handoffRequestFixtureInput().transfer,
          asset: { symbol: "USDC", chain: "base:mainnet", assetId: "asset.usdc.eth" },
        },
      }),
    ).toThrow(/live on the bound chain/);
  });

  it("a settlement-instruction reference failing the pinned shape law is rejected", () => {
    expect(() =>
      buildWalletPaymentHandoffRequest({
        ...handoffRequestFixtureInput(),
        settlementInstructionId: " not-trimmed ",
      }),
    ).toThrow(/SettlementInstructionId/);
    expect(() =>
      buildWalletPaymentHandoffRequest({
        ...handoffRequestFixtureInput(),
        settlementInstructionId: "x".repeat(257),
      }),
    ).toThrow(/SettlementInstructionId/);
    expect(asSettlementInstructionId("si:valid")).toBe("si:valid");
  });

  it("empty digests or an empty identity field is rejected fail-closed", () => {
    expect(() =>
      buildWalletPaymentHandoffRequest({ ...handoffRequestFixtureInput(), writeDigest: "" }),
    ).toThrow(ValidationError);
    expect(() =>
      buildWalletPaymentHandoffRequest({
        ...handoffRequestFixtureInput(),
        transfer: { ...handoffRequestFixtureInput().transfer, to: "" },
      }),
    ).toThrow(ValidationError);
  });
});

describe("performing the handoff through the port's ONE method", () => {
  it("the submitting port answers a validated, frozen, evidence-bearing receipt", () => {
    const { receipt, request } = ((): { receipt: PinnedWalletPaymentHandoffReceipt; request: ReturnType<typeof handoffRequestFixture> } => {
      const calls: ReturnType<typeof handoffRequestFixture>[] = [];
      const port = submittingPortFixture(calls);
      const req = handoffRequestFixture("handoff.s1");
      return { receipt: performWalletPaymentHandoff(port, req), request: req };
    })();
    expect(receipt.handoffId).toBe(request.handoffId);
    expect(receipt.handoffState).toBe("SUBMITTED");
    expect(receipt.externalSubmissionRef).toBe("tx:fixture-handoff.s1");
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(receipt.evidenceRefs.length).toBeGreaterThan(0);
  });

  it("a receipt answering a DIFFERENT handoff id is rejected (fail-closed correlation)", () => {
    const port: PinnedWalletPaymentExecutionPort = {
      handoff: (request) =>
        ({
          handoffId: `other:${request.handoffId}`,
          handoffState: "SUBMITTED",
          externalSubmissionRef: "tx:other",
          evidenceRefs: ["evidence:other"],
        }) as PinnedWalletPaymentHandoffReceipt,
    };
    expect(() => performWalletPaymentHandoff(port, handoffRequestFixture())).toThrow(/handoffId/);
  });

  it("a receipt with an undeclared state or empty evidence is rejected", () => {
    const badState: PinnedWalletPaymentExecutionPort = {
      handoff: (request) =>
        ({
          handoffId: request.handoffId,
          handoffState: "SUCCEEDED" as never,
          externalSubmissionRef: "tx:bad",
          evidenceRefs: ["evidence:bad"],
        }) as unknown as PinnedWalletPaymentHandoffReceipt,
    };
    expect(() => performWalletPaymentHandoff(badState, handoffRequestFixture())).toThrow(
      /declared member/,
    );
    const noEvidence: PinnedWalletPaymentExecutionPort = {
      handoff: (request) =>
        ({
          handoffId: request.handoffId,
          handoffState: "SUBMITTED",
          externalSubmissionRef: "tx:none",
          evidenceRefs: [],
        }) as PinnedWalletPaymentHandoffReceipt,
    };
    expect(() => performWalletPaymentHandoff(noEvidence, handoffRequestFixture())).toThrow(
      /evidence refs/,
    );
  });

  it("the refusing port refuses BEFORE any external effect (evidence kept, no submission)", () => {
    const receipt = performWalletPaymentHandoff(refusingPortFixture(), handoffRequestFixture("handoff.r1"));
    expect(receipt.handoffState).toBe("REFUSED");
    expect(receipt.evidenceRefs.length).toBeGreaterThan(0);
  });

  it("the ambiguous port preserves OUTCOME_UNKNOWN first-class with evidence", () => {
    const receipt = performWalletPaymentHandoff(ambiguousPortFixture(), handoffRequestFixture("handoff.u1"));
    expect(receipt.handoffState).toBe("OUTCOME_UNKNOWN");
    expect(receipt.reportedOutcome).toBe("OUTCOME_UNKNOWN");
  });
});

describe("THE NO-SUCCESS-INFERENCE LAW (the receipt is evidence, never authority)", () => {
  it("a SUBMITTED receipt maps to SUBMISSION_EVIDENCE only — never a definitive outcome", () => {
    const { receipt } = ((): { receipt: PinnedWalletPaymentHandoffReceipt } => {
      const port = submittingPortFixture();
      return { receipt: performWalletPaymentHandoff(port, handoffRequestFixture("handoff.n1")) };
    })();
    const observation = handoffReceiptObservation(receipt);
    expect(observation.kind).toBe("SUBMISSION_EVIDENCE");
    if (observation.kind === "SUBMISSION_EVIDENCE") {
      expect(observation.evidenceIds.length).toBeGreaterThan(0);
      expect(observation.externalSubmissionRef).toBe("tx:fixture-handoff.n1");
    }
  });

  it("an OUTCOME_UNKNOWN receipt maps to the ambiguity observation; a REFUSED receipt to no submission", () => {
    const ambiguous = handoffReceiptObservation(
      performWalletPaymentHandoff(ambiguousPortFixture(), handoffRequestFixture("handoff.n2")),
    );
    expect(ambiguous.kind).toBe("OUTCOME_UNKNOWN");
    if (ambiguous.kind === "OUTCOME_UNKNOWN") {
      expect(ambiguous.evidenceIds.length).toBeGreaterThan(0);
    }
    const refused = handoffReceiptObservation(
      performWalletPaymentHandoff(refusingPortFixture(), handoffRequestFixture("handoff.n3")),
    );
    expect(refused.kind).toBe("REFUSED");
  });

  it("the authorization bundle + lineage: the customer's approval is content-addressed and handoff-bound", () => {
    const bundle = authorizationBundleFixture();
    expect(bundle.requestHash).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.writeDigest).toMatch(/^[0-9a-f]{16}$/);
    expect(bundle.paymentSummary.length).toBe(6);
    expect(bundle.paymentSummary[0]).toBe("Pay Fixture Coffee Roasters");
    const { receipt } = ((): { receipt: PinnedWalletPaymentHandoffReceipt } => {
      const port = submittingPortFixture();
      return { receipt: performWalletPaymentHandoff(port, handoffRequestFixture("handoff.l1")) };
    })();
    const lineage = walletPaymentAuthorizationLineage({ bundle, handoffReceipt: receipt });
    expect(lineage.authorizationRequestHash).toBe(bundle.requestHash);
    expect(lineage.writeDigest).toBe(bundle.writeDigest);
    expect(lineage.paymentSummaryDigest).toBe(bundle.summaryDigest);
    expect(lineage.handoffId).toBe(receipt.handoffId);
    expect(lineage.externalSubmissionRef).toBe(receipt.externalSubmissionRef);
    expect(lineage.evidenceRefs.length).toBeGreaterThan(3);
  });

  it("the full walk over the open flow: prepare → authorize → handoff → lineage (deterministic)", () => {
    const flow = openFlowFixture();
    const bundle = buildCheckoutAuthorization({
      flow,
      optionId: "crypto:asset.usdc@chain.eth-mainnet",
      customerWalletAddress: CUSTOMER_ADDRESS,
      destinationAddress: MERCHANT_ADDRESS,
      requestId: "authreq:walk-1",
      requestedBy: "surface:checkout-web",
      merchantName: "Fixture Coffee Roasters",
      now: flow.openedAt,
    });
    const port = submittingPortFixture();
    const request = buildWalletPaymentHandoffRequest({
      handoffId: "handoff.walk-1",
      attemptId: "attempt:walk-1",
      optionId: "crypto:asset.usdc@chain.eth-mainnet",
      quoteId: bundle.request.quoteId,
      settlementInstructionId: SETTLEMENT_INSTRUCTION_REF,
      transfer: {
        asset: USDC_ETH_BINDING.assetIdentity,
        amount: canonicalQuote().cryptoAmount.value,
        from: CUSTOMER_ADDRESS,
        to: MERCHANT_ADDRESS,
      },
      chainRef: USDC_ETH_BINDING.chainRef,
      paymentSummaryDigest: bundle.summaryDigest,
      writeDigest: bundle.writeDigest,
      expiresAt: canonicalQuote().validUntil,
    });
    const receipt = performWalletPaymentHandoff(port, request);
    const lineage = walletPaymentAuthorizationLineage({ bundle, handoffReceipt: receipt });
    expect(lineage.chainRef).toBe(USDC_ETH_BINDING.chainRef);
    // The transfer the customer authorized is EXACTLY the quote amount.
    expect(bundle.request.transfer.amount).toBe(canonicalQuote().cryptoAmount.value);
    expect(bundle.request.transfer.from).toBe(CUSTOMER_ADDRESS);
    expect(bundle.request.transfer.to).toBe(MERCHANT_ADDRESS);
  });
});

function handoffRequestFixtureInput() {
  return {
    handoffId: "handoff.fixture.input",
    attemptId: "attempt:handoff.fixture.input",
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
  };
}
